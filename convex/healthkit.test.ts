import { describe, expect, it } from "vitest";

import { filterWorkoutsWithinLookbackWindow } from "./healthkit";

describe("healthkit import window", () => {
  it("keeps only workouts from the last 12 weeks", () => {
    const now = Date.UTC(2026, 2, 8);
    const recentStartedAt = now - 83 * 24 * 60 * 60 * 1000;
    const oldStartedAt = now - 85 * 24 * 60 * 60 * 1000;

    const workouts = filterWorkoutsWithinLookbackWindow(
      [
        { startedAt: recentStartedAt },
        { startedAt: oldStartedAt },
      ],
      now,
    );

    expect(workouts).toEqual([{ startedAt: recentStartedAt }]);
  });
});
