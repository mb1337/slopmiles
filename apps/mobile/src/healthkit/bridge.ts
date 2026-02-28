import { NativeModules, Platform } from "react-native";

type HealthKitAuthorizationStatus = "authorized" | "denied" | "notDetermined" | "unavailable";

export type HealthKitPermissionResult = {
  status: HealthKitAuthorizationStatus;
  authorized: boolean;
  reason?: string;
};

type NativeHealthKitBridge = {
  requestAuthorization: () => Promise<HealthKitPermissionResult>;
};

const bridge = NativeModules.SlopMilesHealthKitBridge as NativeHealthKitBridge | undefined;

export async function requestHealthKitAuthorization(): Promise<HealthKitPermissionResult> {
  if (Platform.OS !== "ios") {
    return {
      status: "unavailable",
      authorized: false,
      reason: "HealthKit is only available on iOS.",
    };
  }

  if (!bridge?.requestAuthorization) {
    return {
      status: "unavailable",
      authorized: false,
      reason: "Native HealthKit bridge is not linked yet.",
    };
  }

  try {
    return await bridge.requestAuthorization();
  } catch (error) {
    return {
      status: "unavailable",
      authorized: false,
      reason: String(error),
    };
  }
}
