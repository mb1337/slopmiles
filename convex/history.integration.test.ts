// @vitest-environment edge-runtime

import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import { asAuthenticatedUser, createConvexTest, createTestUser } from "./test.setup";

describe("history integration", () => {
  it("returns feed counts from the maintained history summary", async () => {
    const t = createConvexTest();
    const user = await createTestUser(t);
    const authed = asAuthenticatedUser(t, user._id);

    await authed.mutation(api.healthkit.seedImportWorkouts, {
      workouts: [
        {
          externalWorkoutId: "hk-unplanned-1",
          startedAt: Date.UTC(2026, 2, 10, 12, 0, 0),
          endedAt: Date.UTC(2026, 2, 10, 12, 30, 0),
          durationSeconds: 1_800,
          distanceMeters: 5_000,
        },
        {
          externalWorkoutId: "hk-unplanned-2",
          startedAt: Date.UTC(2026, 2, 11, 12, 0, 0),
          endedAt: Date.UTC(2026, 2, 11, 12, 35, 0),
          durationSeconds: 2_100,
          distanceMeters: 6_000,
        },
      ],
      source: "manual",
    });

    const result = await authed.query(api.history.getFeedCounts, {});

    expect(result).toEqual({
      matched: 0,
      needsReview: 0,
      unplanned: 2,
    });
  });
});
