// @vitest-environment edge-runtime

import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import {
  asAuthenticatedUser,
  createConvexTest,
  createTestUser,
  getAiRequestsForUser,
  getCompetitivenessForUser,
  getOnboardingStateForUser,
  getPersonalityForUser,
  getPlansForUser,
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

  it("returns persisted session state including sanitized schedule and strength preferences", async () => {
    const t = createConvexTest();
    const user = await createTestUser(t, {
      currentVDOT: 53.2,
    });
    const authed = asAuthenticatedUser(t, user._id);

    await authed.mutation(api.session.bootstrapSession, {});
    await authed.mutation(api.users.updateRunningSchedule, {
      preferredRunningDays: ["tuesday", "thursday", "saturday", "tuesday"],
      runningDaysPerWeek: 3,
      preferredLongRunDay: "saturday",
      preferredQualityDays: ["thursday", "tuesday", "thursday"],
      availabilityWindows: {
        tuesday: [{ start: "06:00", end: "07:30" }],
        thursday: [
          { start: "18:00", end: "19:00" },
          { start: "07:00", end: "08:00" },
        ],
        sunday: [{ start: "09:00", end: "10:00" }],
      },
    });
    await authed.mutation(api.users.updateStrengthPreferences, {
      enabled: true,
      equipment: ["bands", "dumbbells", "bands"],
    });
    await authed.mutation(api.users.updateCompetitiveness, {
      level: "aggressive",
    });
    await authed.mutation(api.users.updatePersonality, {
      preset: "custom",
      customDescription: "  Loves splits and clean data.  ",
    });

    const result = await authed.query(api.session.getSessionState, {});

    expect(result?.user?._id).toBe(user._id);
    expect(result?.user?.currentVDOT).toBe(53.2);
    expect(result?.runningSchedule).toMatchObject({
      preferredRunningDays: ["tuesday", "thursday", "saturday"],
      runningDaysPerWeek: 3,
      preferredLongRunDay: "saturday",
      preferredQualityDays: ["thursday", "tuesday"],
      availabilityWindows: {
        tuesday: [{ start: "06:00", end: "07:30" }],
        thursday: [
          { start: "07:00", end: "08:00" },
          { start: "18:00", end: "19:00" },
        ],
      },
    });
    expect(result?.competitiveness?.level).toBe("aggressive");
    expect(result?.personality).toMatchObject({
      name: "custom",
      description: "Loves splits and clean data.",
    });
    expect(result?.strengthPreference).toEqual({
      enabled: true,
      equipment: ["bands", "dumbbells"],
    });
  });

  it("removes dependent plan rows during app-data reset", async () => {
    const t = createConvexTest();
    const user = await createTestUser(t);
    const authed = asAuthenticatedUser(t, user._id);

    await t.run(async (ctx) => {
      const now = Date.now();
      const goalId = await ctx.db.insert("goals", {
        userId: user._id,
        type: "race",
        label: "Reset target",
        createdAt: now,
      });
      const planId = await ctx.db.insert("trainingPlans", {
        userId: user._id,
        goalId,
        numberOfWeeks: 4,
        volumeMode: "time",
        peakWeekVolume: 300,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const weekId = await ctx.db.insert("trainingWeeks", {
        planId,
        weekNumber: 1,
        weekStartDateKey: "2026-03-16",
        weekEndDateKey: "2026-03-22",
        targetVolumePercent: 0.75,
        targetVolumeAbsolute: 225,
        emphasis: "Reset test",
        generated: true,
        createdAt: now,
        updatedAt: now,
      });
      const workoutId = await ctx.db.insert("workouts", {
        planId,
        weekId,
        type: "easyRun",
        volumePercent: 0.2,
        absoluteVolume: 45,
        scheduledDateKey: "2026-03-17",
        venue: "road",
        origin: "planned",
        status: "planned",
        segments: [],
        createdAt: now,
        updatedAt: now,
      });
      const healthKitWorkoutId = await ctx.db.insert("healthKitWorkouts", {
        userId: user._id,
        externalWorkoutId: "hk-reset",
        startedAt: Date.UTC(2026, 2, 17, 12, 0, 0),
        endedAt: Date.UTC(2026, 2, 17, 12, 30, 0),
        durationSeconds: 1_800,
        distanceMeters: 5_000,
        historyStatus: "matched",
        importedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("workoutExecutions", {
        userId: user._id,
        healthKitWorkoutId,
        planId,
        weekId,
        plannedWorkoutId: workoutId,
        matchStatus: "matched",
        matchMethod: "manual",
        checkInStatus: "pending",
        modifiers: [],
        feedbackStatus: "pending",
        feedbackAdjustments: [],
        createdAt: now,
        updatedAt: now,
      });
    });

    await authed.mutation(api.settings.resetAppData, {});

    const [plans, aiRequests, leftovers] = await Promise.all([
      getPlansForUser(t, user._id),
      getAiRequestsForUser(t, user._id),
      t.run(async (ctx) => {
        const [workouts, weeks, executions, healthKitWorkouts, summary] = await Promise.all([
          ctx.db.query("workouts").collect(),
          ctx.db.query("trainingWeeks").collect(),
          ctx.db.query("workoutExecutions").withIndex("by_user_id", (query) => query.eq("userId", user._id)).collect(),
          ctx.db.query("healthKitWorkouts").withIndex("by_user_id", (query) => query.eq("userId", user._id)).collect(),
          ctx.db.query("historySummaries").withIndex("by_user_id", (query) => query.eq("userId", user._id)).unique(),
        ]);

        return {
          workouts,
          weeks,
          executions,
          healthKitWorkouts,
          summary,
        };
      }),
    ]);

    expect(plans).toHaveLength(0);
    expect(aiRequests).toHaveLength(0);
    expect(leftovers.workouts).toHaveLength(0);
    expect(leftovers.weeks).toHaveLength(0);
    expect(leftovers.executions).toHaveLength(0);
    expect(leftovers.healthKitWorkouts).toHaveLength(0);
    expect(leftovers.summary).toMatchObject({
      matchedCount: 0,
      needsReviewCount: 0,
      unplannedCount: 0,
      totalCount: 0,
    });
  });
});
