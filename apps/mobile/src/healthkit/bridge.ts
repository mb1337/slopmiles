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
import {
  aggregateGapMicroSegmentsForInterval,
  analyzeRouteForGap,
  calculatePaceSecondsPerMeter,
} from "@slopmiles/domain";
import { Platform } from "react-native";

import { buildMarkerBoundedIntervals } from "./intervalMarkers";

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
  rawPaceSecondsPerMeter?: number;
  gradeAdjustedPaceSecondsPerMeter?: number;
  equivalentFlatDistanceMeters?: number;
  elevationAscentMeters?: number;
  elevationDescentMeters?: number;
  averageHeartRate?: number;
  maxHeartRate?: number;
  intervals?: HealthKitWorkoutInterval[];
  sourceName?: string;
  sourceBundleIdentifier?: string;
};

export type HealthKitWorkoutInterval = {
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  distanceMeters?: number;
  rawPaceSecondsPerMeter?: number;
  gradeAdjustedPaceSecondsPerMeter?: number;
  equivalentFlatDistanceMeters?: number;
  elevationAscentMeters?: number;
  elevationDescentMeters?: number;
  averageHeartRate?: number;
};

export type HealthKitSeedPayload = {
  workouts: HealthKitImportedWorkout[];
  restingHeartRate?: number;
  inferredMaxHeartRate?: number;
  windowEndedAt: number;
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

  if (normalizedUnit === "ft" || normalizedUnit === "foot" || normalizedUnit === "feet") {
    return quantity * 0.3048;
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
type RouteGapAnalysis = NonNullable<ReturnType<typeof analyzeRouteForGap>>;
type RouteLocationForGap = Parameters<typeof analyzeRouteForGap>[0][number];

function isMarkerEventType(eventType: WorkoutEventType): boolean {
  return eventType === WorkoutEventType.marker;
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

function resolveWorkoutElevationFromMetadata(
  workout: WorkoutProxy,
): { elevationAscentMeters?: number; elevationDescentMeters?: number } {
  const elevationAscentMeters = workout.metadataElevationAscended
    ? toDistanceMeters(workout.metadataElevationAscended.quantity, workout.metadataElevationAscended.unit)
    : undefined;
  const elevationDescentMeters = workout.metadataElevationDescended
    ? toDistanceMeters(workout.metadataElevationDescended.quantity, workout.metadataElevationDescended.unit)
    : undefined;

  return {
    ...(typeof elevationAscentMeters === "number" ? { elevationAscentMeters } : {}),
    ...(typeof elevationDescentMeters === "number" ? { elevationDescentMeters } : {}),
  };
}

function resolveRouteGapAnalysis(
  routeLocations: RouteLocationForGap[] | undefined,
  workout: WorkoutProxy,
): RouteGapAnalysis | null {
  if (!routeLocations || routeLocations.length === 0) {
    return null;
  }

  const elevationFromMetadata = resolveWorkoutElevationFromMetadata(workout);
  return analyzeRouteForGap(routeLocations, {
    targetAscentMeters: elevationFromMetadata.elevationAscentMeters,
    targetDescentMeters: elevationFromMetadata.elevationDescentMeters,
  });
}

async function resolveWorkoutRouteLocations(workout: WorkoutProxy): Promise<RouteLocationForGap[] | undefined> {
  const routes = await workout.getWorkoutRoutes().catch(() => undefined);
  if (!routes || routes.length === 0) {
    return undefined;
  }

  return routes.flatMap((route) =>
    route.locations.map((location) => ({
      latitude: location.latitude,
      longitude: location.longitude,
      altitudeMeters: location.altitude,
      timestampMs: location.date.getTime(),
      distanceFromPreviousMeters: location.distance,
      horizontalAccuracyMeters: location.horizontalAccuracy,
      verticalAccuracyMeters: location.verticalAccuracy,
    })),
  );
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

async function resolveWorkoutIntervals(
  workout: WorkoutProxy,
  routeGapAnalysis: RouteGapAnalysis | null,
): Promise<HealthKitWorkoutInterval[] | undefined> {
  const events = workout.events;
  if (!events || events.length === 0) {
    return undefined;
  }

  const markerEvents = [...events]
    .filter((event) => isMarkerEventType(event.type))
    .sort((left, right) => left.startDate.getTime() - right.startDate.getTime());

  if (markerEvents.length === 0) {
    return undefined;
  }

  const markerBoundaries = buildMarkerBoundedIntervals({
    workoutStartedAt: workout.startDate.getTime(),
    workoutEndedAt: workout.endDate.getTime(),
    markerTimestamps: markerEvents.map((event) => event.startDate.getTime()),
  });
  if (markerBoundaries.length <= 1) {
    return undefined;
  }

  const distanceSlices = await resolveWorkoutDistanceSlices(workout);

  const intervals = await Promise.all(
    markerBoundaries.map(async ({ startedAt, endedAt }) => {
      const averageHeartRate = await queryIntervalStats(workout, new Date(startedAt), new Date(endedAt));
      const distanceMeters = resolveIntervalDistanceMeters(distanceSlices, startedAt, endedAt);
      const gapAggregate = routeGapAnalysis
        ? aggregateGapMicroSegmentsForInterval(routeGapAnalysis.microSegments, startedAt, endedAt)
        : null;
      const rawPaceSecondsPerMeter =
        gapAggregate?.rawPaceSecondsPerMeter ?? calculatePaceSecondsPerMeter(Math.round((endedAt - startedAt) / 1000), distanceMeters);

      return {
        startedAt,
        endedAt,
        durationSeconds: Math.round((endedAt - startedAt) / 1000),
        ...(typeof distanceMeters === "number" ? { distanceMeters } : {}),
        ...(typeof rawPaceSecondsPerMeter === "number" ? { rawPaceSecondsPerMeter } : {}),
        ...(typeof gapAggregate?.gradeAdjustedPaceSecondsPerMeter === "number"
          ? { gradeAdjustedPaceSecondsPerMeter: gapAggregate.gradeAdjustedPaceSecondsPerMeter }
          : {}),
        ...(typeof gapAggregate?.equivalentFlatDistanceMeters === "number"
          ? { equivalentFlatDistanceMeters: gapAggregate.equivalentFlatDistanceMeters }
          : {}),
        ...(typeof gapAggregate?.elevationGainMeters === "number"
          ? { elevationAscentMeters: gapAggregate.elevationGainMeters }
          : {}),
        ...(typeof gapAggregate?.elevationLossMeters === "number"
          ? { elevationDescentMeters: gapAggregate.elevationLossMeters }
          : {}),
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

async function serializeWorkout(workout: WorkoutProxy): Promise<HealthKitImportedWorkout> {
  const durationSeconds = resolveWorkoutDurationSeconds(workout);
  const [heartRateStats, distanceMeters, routeLocations] = await Promise.all([
    queryHeartRateStats(workout),
    resolveWorkoutDistanceMeters(workout),
    resolveWorkoutRouteLocations(workout),
  ]);
  const routeGapAnalysis = resolveRouteGapAnalysis(routeLocations, workout);
  const intervals = await resolveWorkoutIntervals(workout, routeGapAnalysis);
  const rawPaceSecondsPerMeter = calculatePaceSecondsPerMeter(durationSeconds, distanceMeters);
  const elevationFromMetadata = resolveWorkoutElevationFromMetadata(workout);

  return {
    externalWorkoutId: workout.uuid,
    startedAt: workout.startDate.getTime(),
    endedAt: workout.endDate.getTime(),
    durationSeconds,
    distanceMeters,
    ...(typeof rawPaceSecondsPerMeter === "number" ? { rawPaceSecondsPerMeter } : {}),
    ...(typeof routeGapAnalysis?.gradeAdjustedPaceSecondsPerMeter === "number"
      ? { gradeAdjustedPaceSecondsPerMeter: routeGapAnalysis.gradeAdjustedPaceSecondsPerMeter }
      : {}),
    ...(typeof routeGapAnalysis?.equivalentFlatDistanceMeters === "number"
      ? { equivalentFlatDistanceMeters: routeGapAnalysis.equivalentFlatDistanceMeters }
      : {}),
    ...(typeof elevationFromMetadata.elevationAscentMeters === "number"
      ? { elevationAscentMeters: elevationFromMetadata.elevationAscentMeters }
      : typeof routeGapAnalysis?.elevationAscentMeters === "number"
        ? { elevationAscentMeters: routeGapAnalysis.elevationAscentMeters }
        : {}),
    ...(typeof elevationFromMetadata.elevationDescentMeters === "number"
      ? { elevationDescentMeters: elevationFromMetadata.elevationDescentMeters }
      : typeof routeGapAnalysis?.elevationDescentMeters === "number"
        ? { elevationDescentMeters: routeGapAnalysis.elevationDescentMeters }
        : {}),
    averageHeartRate: heartRateStats.averageHeartRate,
    maxHeartRate: heartRateStats.maxHeartRate,
    intervals,
    sourceName: workout.sourceRevision.source.name,
    sourceBundleIdentifier: workout.sourceRevision.source.bundleIdentifier,
  } satisfies HealthKitImportedWorkout;
}

async function serializeWorkouts(workouts: WorkoutProxy[]): Promise<HealthKitImportedWorkout[]> {
  return Promise.all(workouts.map((workout) => serializeWorkout(workout)));
}

export async function importHealthKitWorkoutsByIds(externalWorkoutIds: string[]): Promise<HealthKitImportedWorkout[]> {
  if (Platform.OS !== "ios" || externalWorkoutIds.length === 0 || !isHealthDataAvailable()) {
    return [];
  }

  const queriedWorkouts = await queryWorkoutSamples({
    limit: externalWorkoutIds.length,
    ascending: false,
    filter: {
      uuids: externalWorkoutIds,
    },
  });

  const runningWorkouts = queriedWorkouts.filter((workout) => workout.workoutActivityType === WorkoutActivityType.running);
  const serializedWorkouts = await serializeWorkouts(runningWorkouts);
  const workoutOrder = new Map(externalWorkoutIds.map((workoutId, index) => [workoutId, index]));

  return serializedWorkouts.sort(
    (left, right) => (workoutOrder.get(left.externalWorkoutId) ?? Number.MAX_SAFE_INTEGER) - (workoutOrder.get(right.externalWorkoutId) ?? Number.MAX_SAFE_INTEGER),
  );
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
      windowEndedAt: Date.now(),
    };
  }

  if (!isHealthDataAvailable()) {
    return {
      workouts: [],
      windowEndedAt: Date.now(),
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
  const workouts = await serializeWorkouts(runningWorkouts);

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
    windowEndedAt: now.getTime(),
  };
}
