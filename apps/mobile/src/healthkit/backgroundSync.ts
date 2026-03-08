import { type EventSubscription, requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

export type HealthKitBackgroundRegistrationResult = {
  enabled: boolean;
  reason?: string;
};

export type PendingHealthKitWorkoutSync = {
  pendingSyncId: string;
  workoutExternalIds: string[];
  detectedAt: number;
};

type BackgroundSyncNativeModule = {
  ensureBackgroundSyncRegistered(): Promise<HealthKitBackgroundRegistrationResult>;
  primeBackgroundSyncAfterBackfill(backfillEndedAt: number): Promise<HealthKitBackgroundRegistrationResult>;
  getPendingWorkoutSync(): Promise<PendingHealthKitWorkoutSync | null>;
  completePendingWorkoutSync(pendingSyncId: string, success: boolean): Promise<void>;
  addListener(
    eventName: "onPendingWorkoutSync",
    listener: (payload: PendingHealthKitWorkoutSync) => void,
  ): EventSubscription;
};

const nativeModule = Platform.OS === "ios"
  ? requireOptionalNativeModule<BackgroundSyncNativeModule>("SlopMilesHealthKitBridge")
  : null;

export async function ensureBackgroundSyncRegistered(): Promise<HealthKitBackgroundRegistrationResult> {
  if (!nativeModule) {
    return {
      enabled: false,
      reason: "Background HealthKit sync is only available on iOS.",
    };
  }

  return nativeModule.ensureBackgroundSyncRegistered();
}

export async function primeBackgroundSyncAfterBackfill(
  backfillEndedAt: number,
): Promise<HealthKitBackgroundRegistrationResult> {
  if (!nativeModule) {
    return {
      enabled: false,
      reason: "Background HealthKit sync is only available on iOS.",
    };
  }

  return nativeModule.primeBackgroundSyncAfterBackfill(backfillEndedAt);
}

export async function getPendingWorkoutSync(): Promise<PendingHealthKitWorkoutSync | null> {
  if (!nativeModule) {
    return null;
  }

  return nativeModule.getPendingWorkoutSync();
}

export async function completePendingWorkoutSync(args: {
  pendingSyncId: string;
  success: boolean;
}): Promise<void> {
  if (!nativeModule) {
    return;
  }

  await nativeModule.completePendingWorkoutSync(args.pendingSyncId, args.success);
}

export function addPendingWorkoutSyncListener(
  listener: (payload: PendingHealthKitWorkoutSync) => void,
): EventSubscription | null {
  if (!nativeModule) {
    return null;
  }

  return nativeModule.addListener("onPendingWorkoutSync", listener);
}
