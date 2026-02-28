import {
  WorkoutActivityType,
  WorkoutTypeIdentifier,
  WorkoutRouteTypeIdentifier,
  getDateOfBirthAsync,
  getMostRecentQuantitySample,
  isHealthDataAvailable,
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
  sourceName?: string;
  sourceBundleIdentifier?: string;
};

export type HealthKitSeedPayload = {
  workouts: HealthKitImportedWorkout[];
  restingHeartRate?: number;
  inferredMaxHeartRate?: number;
};

const HEALTHKIT_READ_TYPES = [
  WorkoutTypeIdentifier,
  WorkoutRouteTypeIdentifier,
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
      const [heartRateStats, distanceMeters] = await Promise.all([
        queryHeartRateStats(workout),
        resolveWorkoutDistanceMeters(workout),
      ]);

      return {
        externalWorkoutId: workout.uuid,
        startedAt: workout.startDate.getTime(),
        endedAt: workout.endDate.getTime(),
        durationSeconds: resolveWorkoutDurationSeconds(workout),
        distanceMeters,
        averageHeartRate: heartRateStats.averageHeartRate,
        maxHeartRate: heartRateStats.maxHeartRate,
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
