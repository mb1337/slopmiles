export type HealthKitPermissionPayload = {
  status: "authorized" | "denied" | "notDetermined" | "unavailable";
  authorized: boolean;
  reason?: string;
};

export const moduleName = "SlopMilesHealthKitBridge";
