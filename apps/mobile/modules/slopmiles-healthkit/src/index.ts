export type HealthKitBackgroundRegistrationResult = {
  enabled: boolean;
  reason?: string;
};

export type PendingHealthKitWorkoutSync = {
  pendingSyncId: string;
  workoutExternalIds: string[];
  detectedAt: number;
};

export type HealthKitBackgroundSyncEvents = {
  onPendingWorkoutSync: (payload: PendingHealthKitWorkoutSync) => void;
};

export const moduleName = "SlopMilesHealthKitBridge";
