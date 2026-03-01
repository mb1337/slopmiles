import {
  WorkoutActivityType,
  WorkoutEventType,
  WorkoutTypeIdentifier,
  WorkoutRouteTypeIdentifier,
  getDateOfBirthAsync,
  getMostRecentQuantitySample,
  isHealthDataAvailable,
  queryQuantitySamples,
  queryStatisticsForQuantity,
  queryWorkoutSamples,
  requestAuthorization,
} from "@kingstinct/react-native-healthkit";
import { Platform } from "react-native";

export type HealthKitAuthorizationStatus = "authorized" | "denied" | "notDetermined" | "unavailable";

export type HealthKitPermissionResult = {
  status: HealthKitAuthorizationStatus;
  authorized: boolean;
  reason?: string;
};

export type HealthKitImportedWorkout = {
  externalWorkoutId: string;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  distanceMeters?: number;
  averageHeartRate?: number;
  maxHeartRate?: number;
  intervalChains?: HealthKitWorkoutIntervalChain[];
  sourceName?: string;
  sourceBundleIdentifier?: string;
};

export type HealthKitWorkoutInterval = {
  type: "lap" | "segment";
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  distanceMeters?: number;
  averageHeartRate?: number;
};

export type HealthKitWorkoutIntervalChain = {
  chainIndex: number;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  intervalCount: number;
  distanceMeters?: number;
  intervals: HealthKitWorkoutInterval[];
};

export type HealthKitSeedPayload = {
  workouts: HealthKitImportedWorkout[];
  restingHeartRate?: number;
  inferredMaxHeartRate?: number;
};

const HEALTHKIT_READ_TYPES = [
  WorkoutTypeIdentifier,
  WorkoutRouteTypeIdentifier,
  "HKQuantityTypeIdentifierDistanceWalkingRunning",
  "HKQuantityTypeIdentifierHeartRate",
  "HKQuantityTypeIdentifierRestingHeartRate",
  "HKCharacteristicTypeIdentifierDateOfBirth",
] as const;

function toDistanceMeters(quantity: number, unit: string): number | undefined {
  const normalizedUnit = unit.toLowerCase();

  if (normalizedUnit === "m" || normalizedUnit === "meter" || normalizedUnit === "meters") {
    return quantity;
  }

  if (normalizedUnit === "km" || normalizedUnit === "kilometer" || normalizedUnit === "kilometers") {
    return quantity * 1000;
  }

  if (normalizedUnit === "mi" || normalizedUnit === "mile" || normalizedUnit === "miles") {
    return quantity * 1609.344;
  }

  return undefined;
}

function computeAge(dateOfBirth: Date, now = new Date()): number {
  const birthYear = dateOfBirth.getUTCFullYear();
  const currentYear = now.getUTCFullYear();
  let age = currentYear - birthYear;

  const currentMonth = now.getUTCMonth();
  const currentDay = now.getUTCDate();
  const birthMonth = dateOfBirth.getUTCMonth();
  const birthDay = dateOfBirth.getUTCDate();

  if (currentMonth < birthMonth || (currentMonth === birthMonth && currentDay < birthDay)) {
    age -= 1;
  }

  return age;
}

export async function requestHealthKitAuthorization(): Promise<HealthKitPermissionResult> {
  if (Platform.OS !== "ios") {
    return {
      status: "unavailable",
      authorized: false,
      reason: "HealthKit is only available on iOS.",
    };
  }

  if (!isHealthDataAvailable()) {
    return {
      status: "unavailable",
      authorized: false,
      reason: "Health data is unavailable on this device.",
    };
  }

  try {
    const granted = await requestAuthorization({
      toRead: HEALTHKIT_READ_TYPES,
    });

    return {
      status: granted ? "authorized" : "denied",
      authorized: granted,
      reason: granted ? undefined : "HealthKit permission was denied.",
    };
  } catch (error) {
    return {
      status: "unavailable",
      authorized: false,
      reason: String(error),
    };
  }
}

async function queryHeartRateStats(workout: WorkoutProxy): Promise<{ averageHeartRate?: number; maxHeartRate?: number }> {
  try {
    const stats = await queryStatisticsForQuantity(
      "HKQuantityTypeIdentifierHeartRate",
      ["discreteAverage", "discreteMax"],
      {
        filter: { workout },
        unit: "count/min",
      },
    );

    return {
      averageHeartRate: stats.averageQuantity?.quantity,
      maxHeartRate: stats.maximumQuantity?.quantity,
    };
  } catch {
    return {};
  }
}

type WorkoutProxy = Awaited<ReturnType<typeof queryWorkoutSamples>>[number];

function resolveEventIntervalType(eventType: WorkoutEventType): HealthKitWorkoutInterval["type"] | null {
  if (eventType === WorkoutEventType.lap) {
    return "lap";
  }

  if (eventType === WorkoutEventType.segment) {
    return "segment";
  }

  return null;
}

function resolveWorkoutDurationSeconds(workout: WorkoutProxy): number {
  const start = workout.startDate.getTime();
  const end = workout.endDate.getTime();
  if (end <= start) {
    return 0;
  }

  return Math.round((end - start) / 1000);
}

async function resolveWorkoutDistanceMeters(workout: WorkoutProxy): Promise<number | undefined> {
  try {
    const workoutStatistic = await workout.getStatistic("HKQuantityTypeIdentifierDistanceWalkingRunning", "m");
    const statisticDistance = workoutStatistic?.sumQuantity?.quantity;

    if (typeof statisticDistance === "number") {
      return statisticDistance;
    }
  } catch {
    // Fall back to workout totals below.
  }

  if (workout.totalDistance) {
    return toDistanceMeters(workout.totalDistance.quantity, workout.totalDistance.unit);
  }

  return undefined;
}

async function queryIntervalStats(
  workout: WorkoutProxy,
  startDate: Date,
  endDate: Date,
): Promise<number | undefined> {
  const heartRateStats = await queryStatisticsForQuantity("HKQuantityTypeIdentifierHeartRate", ["discreteAverage"], {
    filter: {
      workout,
      date: {
        startDate,
        endDate,
        strictStartDate: true,
        strictEndDate: true,
      },
    },
    unit: "count/min",
  }).catch(() => undefined);

  return heartRateStats?.averageQuantity?.quantity;
}

type DistanceSlice = {
  startedAt: number;
  endedAt: number;
  distanceMeters: number;
};

async function resolveWorkoutDistanceSlices(workout: WorkoutProxy): Promise<DistanceSlice[] | undefined> {
  const distanceSamples = await queryQuantitySamples("HKQuantityTypeIdentifierDistanceWalkingRunning", {
    filter: {
      workout,
    },
    ascending: true,
    limit: 0,
    unit: "m",
  }).catch(() => undefined);

  if (!distanceSamples || distanceSamples.length === 0) {
    return undefined;
  }

  const slices: DistanceSlice[] = [];
  for (const sample of distanceSamples) {
    const startedAt = sample.startDate.getTime();
    const endedAt = sample.endDate.getTime();
    if (!Number.isFinite(sample.quantity) || sample.quantity <= 0 || endedAt <= startedAt) {
      continue;
    }

    slices.push({
      startedAt,
      endedAt,
      distanceMeters: sample.quantity,
    });
  }

  return slices.length > 0 ? slices : undefined;
}

function resolveIntervalDistanceMeters(
  slices: DistanceSlice[] | undefined,
  startedAt: number,
  endedAt: number,
): number | undefined {
  if (!slices || slices.length === 0 || endedAt <= startedAt) {
    return undefined;
  }

  let totalDistanceMeters = 0;

  for (const slice of slices) {
    const overlapStartedAt = Math.max(startedAt, slice.startedAt);
    const overlapEndedAt = Math.min(endedAt, slice.endedAt);
    if (overlapEndedAt <= overlapStartedAt) {
      continue;
    }

    const overlapDurationMs = overlapEndedAt - overlapStartedAt;
    const sliceDurationMs = slice.endedAt - slice.startedAt;
    if (sliceDurationMs <= 0) {
      continue;
    }

    const overlapRatio = overlapDurationMs / sliceDurationMs;
    totalDistanceMeters += slice.distanceMeters * overlapRatio;
  }

  return totalDistanceMeters > 0 ? totalDistanceMeters : undefined;
}

async function resolveWorkoutIntervals(workout: WorkoutProxy): Promise<HealthKitWorkoutInterval[] | undefined> {
  const events = workout.events;
  if (!events || events.length === 0) {
    return undefined;
  }

  const intervalEvents = [...events]
    .filter((event) => resolveEventIntervalType(event.type) !== null)
    .sort((left, right) => left.startDate.getTime() - right.startDate.getTime());

  if (intervalEvents.length === 0) {
    return undefined;
  }

  const distanceSlices = await resolveWorkoutDistanceSlices(workout);

  const intervals = await Promise.all(
    intervalEvents.map(async (event) => {
      const type = resolveEventIntervalType(event.type);
      if (!type) {
        return null;
      }

      const startedAt = event.startDate.getTime();
      const endedAt = event.endDate.getTime();
      if (endedAt <= startedAt) {
        return null;
      }

      const averageHeartRate = await queryIntervalStats(workout, event.startDate, event.endDate);
      const distanceMeters = resolveIntervalDistanceMeters(distanceSlices, startedAt, endedAt);

      return {
        type,
        startedAt,
        endedAt,
        durationSeconds: Math.round((endedAt - startedAt) / 1000),
        ...(typeof distanceMeters === "number" ? { distanceMeters } : {}),
        ...(typeof averageHeartRate === "number" ? { averageHeartRate } : {}),
      } satisfies HealthKitWorkoutInterval;
    }),
  );

  const validIntervals: HealthKitWorkoutInterval[] = [];
  for (const interval of intervals) {
    if (interval) {
      validIntervals.push(interval);
    }
  }

  return validIntervals.length > 0 ? validIntervals : undefined;
}

function buildIntervalChain(chainIndex: number, intervals: HealthKitWorkoutInterval[]): HealthKitWorkoutIntervalChain {
  const startedAt = intervals[0]?.startedAt ?? 0;
  const endedAt = intervals[intervals.length - 1]?.endedAt ?? startedAt;
  let distanceMetersTotal = 0;
  let hasDistance = false;

  for (const interval of intervals) {
    if (typeof interval.distanceMeters === "number") {
      distanceMetersTotal += interval.distanceMeters;
      hasDistance = true;
    }
  }

  return {
    chainIndex,
    startedAt,
    endedAt,
    durationSeconds: Math.max(0, Math.round((endedAt - startedAt) / 1000)),
    intervalCount: intervals.length,
    ...(hasDistance ? { distanceMeters: distanceMetersTotal } : {}),
    intervals,
  };
}

function resolveWorkoutIntervalChains(
  intervals: HealthKitWorkoutInterval[] | undefined,
): HealthKitWorkoutIntervalChain[] | undefined {
  if (!intervals || intervals.length === 0) {
    return undefined;
  }

  const orderedIntervals = [...intervals].sort((left, right) => {
    if (left.startedAt !== right.startedAt) {
      return left.startedAt - right.startedAt;
    }
    if (left.endedAt !== right.endedAt) {
      return left.endedAt - right.endedAt;
    }
    if (left.type !== right.type) {
      return left.type < right.type ? -1 : 1;
    }
    return left.durationSeconds - right.durationSeconds;
  });

  const endedAtSet = new Set<number>(orderedIntervals.map((interval) => interval.endedAt));
  const chains: HealthKitWorkoutIntervalChain[] = [];

  const usedIndices = new Set<number>();

  const rootIndices: number[] = [];
  for (let index = 0; index < orderedIntervals.length; index += 1) {
    const interval = orderedIntervals[index]!;
    if (!endedAtSet.has(interval.startedAt)) {
      rootIndices.push(index);
    }
  }

  const findNextIndex = (endedAt: number): number | null => {
    let nextIndex: number | null = null;

    for (let index = 0; index < orderedIntervals.length; index += 1) {
      if (usedIndices.has(index)) {
        continue;
      }

      const candidate = orderedIntervals[index]!;
      if (candidate.startedAt !== endedAt) {
        continue;
      }

      if (nextIndex === null) {
        nextIndex = index;
        continue;
      }

      const currentBest = orderedIntervals[nextIndex]!;
      if (candidate.endedAt < currentBest.endedAt) {
        nextIndex = index;
      }
    }

    return nextIndex;
  };

  const consumeFrom = (startIndex: number) => {
    if (usedIndices.has(startIndex)) {
      return;
    }

    const chainIntervals: HealthKitWorkoutInterval[] = [];
    let currentIndex: number | null = startIndex;

    while (currentIndex !== null) {
      if (usedIndices.has(currentIndex)) {
        break;
      }

      const currentInterval = orderedIntervals[currentIndex]!;
      chainIntervals.push(currentInterval);
      usedIndices.add(currentIndex);

      currentIndex = findNextIndex(currentInterval.endedAt);
    }

    if (chainIntervals.length > 0) {
      chains.push(buildIntervalChain(chains.length + 1, chainIntervals));
    }
  };

  for (const rootIndex of rootIndices) {
    consumeFrom(rootIndex);
  }

  for (let index = 0; index < orderedIntervals.length; index += 1) {
    consumeFrom(index);
  }

  return chains.length > 0 ? chains : undefined;
}

export async function seedRecentHealthKitImport({
  lookbackDays = 84,
  limit = 200,
}: {
  lookbackDays?: number;
  limit?: number;
} = {}): Promise<HealthKitSeedPayload> {
  if (Platform.OS !== "ios") {
    return {
      workouts: [],
    };
  }

  if (!isHealthDataAvailable()) {
    return {
      workouts: [],
    };
  }

  const now = new Date();
  const startDate = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

  const runningWorkouts = await queryWorkoutSamples({
    limit,
    ascending: false,
    filter: {
      workoutActivityType: WorkoutActivityType.running,
      date: {
        startDate,
        endDate: now,
        strictStartDate: true,
        strictEndDate: true,
      },
    },
  });

  const workouts = await Promise.all(
    runningWorkouts.map(async (workout) => {
      const [heartRateStats, distanceMeters, intervals] = await Promise.all([
        queryHeartRateStats(workout),
        resolveWorkoutDistanceMeters(workout),
        resolveWorkoutIntervals(workout),
      ]);
      const intervalChains = resolveWorkoutIntervalChains(intervals);

      return {
        externalWorkoutId: workout.uuid,
        startedAt: workout.startDate.getTime(),
        endedAt: workout.endDate.getTime(),
        durationSeconds: resolveWorkoutDurationSeconds(workout),
        distanceMeters,
        averageHeartRate: heartRateStats.averageHeartRate,
        maxHeartRate: heartRateStats.maxHeartRate,
        intervalChains,
        sourceName: workout.sourceRevision.source.name,
        sourceBundleIdentifier: workout.sourceRevision.source.bundleIdentifier,
      } satisfies HealthKitImportedWorkout;
    }),
  );

  const [restingHeartRateSample, dateOfBirth] = await Promise.all([
    getMostRecentQuantitySample("HKQuantityTypeIdentifierRestingHeartRate").catch(() => undefined),
    getDateOfBirthAsync().catch(() => undefined),
  ]);

  const inferredAge = dateOfBirth ? computeAge(dateOfBirth) : undefined;
  const inferredMaxHeartRate =
    typeof inferredAge === "number" && inferredAge >= 10 && inferredAge <= 110 ? 220 - inferredAge : undefined;

  return {
    workouts,
    restingHeartRate:
      typeof restingHeartRateSample?.quantity === "number" ? Math.round(restingHeartRateSample.quantity) : undefined,
    inferredMaxHeartRate,
  };
}
