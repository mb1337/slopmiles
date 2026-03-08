import { describe, expect, it } from "vitest";

import { findMissingPendingWorkoutIds } from "./backgroundSyncCoordinator";

describe("background sync coordinator", () => {
  it("does not acknowledge a pending sync when HealthKit returns no matching workouts", () => {
    expect(findMissingPendingWorkoutIds(["workout-a"], [])).toEqual(["workout-a"]);
  });

  it("does not acknowledge a pending sync when HealthKit returns only a partial delta", () => {
    expect(findMissingPendingWorkoutIds(["workout-a", "workout-b"], ["workout-b"])).toEqual(["workout-a"]);
  });

  it("allows acknowledgement once every pending workout was serialized", () => {
    expect(findMissingPendingWorkoutIds(["workout-a", "workout-b"], ["workout-b", "workout-a"])).toEqual([]);
  });
});
