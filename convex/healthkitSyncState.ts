import type { Doc } from "./_generated/dataModel";
import type { HealthKitSyncSource } from "./constants";

type UserProfile = Pick<
  Doc<"users">,
  "healthKitLastSyncAt" | "healthKitLastSyncError" | "healthKitLastSyncSource" | "maxHeartRate" | "restingHeartRate"
>;

export function buildHealthKitImportUserPatch(args: {
  user: UserProfile;
  now: number;
  source: HealthKitSyncSource;
  restingHeartRate?: number;
  inferredMaxHeartRate?: number;
}) {
  const restingHeartRate =
    typeof args.restingHeartRate === "number" ? args.restingHeartRate : args.user.restingHeartRate;
  const maxHeartRate =
    typeof args.user.maxHeartRate === "number"
      ? args.user.maxHeartRate
      : typeof args.inferredMaxHeartRate === "number"
        ? args.inferredMaxHeartRate
        : args.user.maxHeartRate;

  return {
    restingHeartRate,
    maxHeartRate,
    healthKitLastSyncAt: args.now,
    healthKitLastSyncSource: args.source,
    healthKitLastSyncError: undefined,
    updatedAt: args.now,
  };
}

export function buildHealthKitSyncStatusPatch(args: {
  user: UserProfile;
  now: number;
  source?: HealthKitSyncSource;
  error?: string;
}) {
  return {
    healthKitLastSyncAt: args.error ? args.user.healthKitLastSyncAt : args.now,
    healthKitLastSyncSource: args.source ?? args.user.healthKitLastSyncSource,
    healthKitLastSyncError: args.error,
    updatedAt: args.now,
  };
}
