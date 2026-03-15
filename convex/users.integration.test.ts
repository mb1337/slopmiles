// @vitest-environment edge-runtime

import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import {
  asAuthenticatedUser,
  createConvexTest,
  createTestUser,
  getCompetitivenessForUser,
  getOnboardingStateForUser,
  getPersonalityForUser,
  getRunningScheduleForUser,
} from "./test.setup";

describe("session bootstrap integration", () => {
  it("returns null when unauthenticated", async () => {
    const t = createConvexTest();

    const result = await t.mutation(api.session.bootstrapSession, {});

    expect(result).toBeNull();
  });

  it("creates missing session rows for an authenticated user", async () => {
    const t = createConvexTest();
    const user = await createTestUser(t);
    const authed = asAuthenticatedUser(t, user._id);

    const result = await authed.mutation(api.session.bootstrapSession, {});

    expect(result?.user._id).toBe(user._id);
    expect(result?.runningSchedule.preferredRunningDays).toEqual([
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ]);
    expect(result?.onboardingState.currentStep).toBe("welcome");
    expect(result?.competitiveness.level).toBe("balanced");
    expect(result?.personality.name).toBe("noNonsense");

    const [runningSchedule, onboardingState, competitiveness, personality] = await Promise.all([
      getRunningScheduleForUser(t, user._id),
      getOnboardingStateForUser(t, user._id),
      getCompetitivenessForUser(t, user._id),
      getPersonalityForUser(t, user._id),
    ]);

    expect(runningSchedule).not.toBeNull();
    expect(onboardingState).not.toBeNull();
    expect(competitiveness).not.toBeNull();
    expect(personality).not.toBeNull();
  });

  it("is idempotent across repeated bootstrap calls", async () => {
    const t = createConvexTest();
    const user = await createTestUser(t);
    const authed = asAuthenticatedUser(t, user._id);

    await authed.mutation(api.session.bootstrapSession, {});
    await authed.mutation(api.session.bootstrapSession, {});

    const counts = await t.run(async (ctx) => {
      const [runningSchedules, onboardingStates, competitivenessRows, personalities] = await Promise.all([
        ctx.db.query("runningSchedules").withIndex("by_user_id", (query) => query.eq("userId", user._id)).collect(),
        ctx.db.query("onboardingStates").withIndex("by_user_id", (query) => query.eq("userId", user._id)).collect(),
        ctx.db.query("competitiveness").withIndex("by_user_id", (query) => query.eq("userId", user._id)).collect(),
        ctx.db.query("personalities").withIndex("by_user_id", (query) => query.eq("userId", user._id)).collect(),
      ]);

      return {
        runningSchedules: runningSchedules.length,
        onboardingStates: onboardingStates.length,
        competitivenessRows: competitivenessRows.length,
        personalities: personalities.length,
      };
    });

    expect(counts).toEqual({
      runningSchedules: 1,
      onboardingStates: 1,
      competitivenessRows: 1,
      personalities: 1,
    });
  });
});
