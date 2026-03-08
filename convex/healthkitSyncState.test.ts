import { describe, expect, it } from "vitest";

import { buildHealthKitImportUserPatch, buildHealthKitSyncStatusPatch } from "./healthkitSyncState";

describe("healthkit sync state", () => {
  it("preserves existing profile metrics during background imports", () => {
    const patch = buildHealthKitImportUserPatch({
      user: {
        restingHeartRate: 48,
        maxHeartRate: 191,
        healthKitLastSyncAt: 1,
        healthKitLastSyncSource: "manual",
        healthKitLastSyncError: "offline",
      },
      now: 2,
      source: "background",
    });

    expect(patch.restingHeartRate).toBe(48);
    expect(patch.maxHeartRate).toBe(191);
    expect(patch.healthKitLastSyncAt).toBe(2);
    expect(patch.healthKitLastSyncSource).toBe("background");
    expect(patch.healthKitLastSyncError).toBeUndefined();
  });

  it("uses inferred max heart rate when no explicit profile value exists", () => {
    const patch = buildHealthKitImportUserPatch({
      user: {
        restingHeartRate: undefined,
        maxHeartRate: undefined,
        healthKitLastSyncAt: undefined,
        healthKitLastSyncSource: undefined,
        healthKitLastSyncError: undefined,
      },
      now: 5,
      source: "manual",
      restingHeartRate: 50,
      inferredMaxHeartRate: 186,
    });

    expect(patch.restingHeartRate).toBe(50);
    expect(patch.maxHeartRate).toBe(186);
  });

  it("preserves the last successful sync timestamp when recording an error", () => {
    const patch = buildHealthKitSyncStatusPatch({
      user: {
        restingHeartRate: 47,
        maxHeartRate: 188,
        healthKitLastSyncAt: 123,
        healthKitLastSyncSource: "manual",
        healthKitLastSyncError: undefined,
      },
      now: 456,
      source: "background",
      error: "Network offline",
    });

    expect(patch.healthKitLastSyncAt).toBe(123);
    expect(patch.healthKitLastSyncSource).toBe("background");
    expect(patch.healthKitLastSyncError).toBe("Network offline");
    expect(patch.updatedAt).toBe(456);
  });
});
