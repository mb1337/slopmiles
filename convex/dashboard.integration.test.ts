// @vitest-environment edge-runtime

import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import { normalizeActivationDateKey } from "./planWeeks";
import { asAuthenticatedUser, createConvexTest, createTestUser } from "./test.setup";

afterEach(() => {
  vi.useRealTimers();
});

describe("dashboard integration", () => {
  it("shows create-plan actions plus draft and review prompts when no active plan exists", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-03-18T15:30:00.000Z");
    vi.setSystemTime(now);

    const t = createConvexTest();
    const user = await createTestUser(t, {
      currentVDOT: 50.8,
    });
    const authed = asAuthenticatedUser(t, user._id);
    const canonicalTimeZoneId = "America/Chicago";

    await t.run(async (ctx) => {
      const draftGoalId = await ctx.db.insert("goals", {
        userId: user._id,
        type: "custom",
        label: "Fall marathon draft",
        createdAt: now.valueOf() - 10_000,
      });
      const pastGoalId = await ctx.db.insert("goals", {
        userId: user._id,
        type: "race",
        label: "Winter 10K",
        targetDate: Date.UTC(2026, 1, 1),
        goalTimeSeconds: 2_700,
        createdAt: now.valueOf() - 20_000,
      });
      await ctx.db.insert("trainingPlans", {
        userId: user._id,
        goalId: draftGoalId,
        numberOfWeeks: 12,
        volumeMode: "time",
        peakWeekVolume: 420,
        status: "draft",
        createdAt: now.valueOf() - 9_000,
        updatedAt: now.valueOf() - 9_000,
      });
      const pastPlanId = await ctx.db.insert("trainingPlans", {
        userId: user._id,
        goalId: pastGoalId,
        startDateKey: "2025-12-01",
        canonicalTimeZoneId,
        activatedAt: now.valueOf() - 5_000_000,
        numberOfWeeks: 8,
        volumeMode: "distance",
        peakWeekVolume: 68_000,
        status: "completed",
        createdAt: now.valueOf() - 19_000,
        updatedAt: now.valueOf() - 19_000,
      });
      await ctx.db.insert("planAssessments", {
        userId: user._id,
        planId: pastPlanId,
        summary: "You raced well after a steady build.",
        volumeAdherence: 0.91,
        paceAdherence: 0.86,
        vdotStart: 48.2,
        vdotEnd: 50.1,
        highlights: ["Long runs stayed consistent."],
        areasForImprovement: ["Recover harder after race-pace work."],
        nextPlanSuggestion: "Extend the next block slightly.",
        discussionPrompts: ["What part of the build felt easiest to sustain?"],
        createdAt: now.valueOf() - 18_000,
        updatedAt: now.valueOf() - 18_000,
      });
      await ctx.db.insert("coachMessages", {
        userId: user._id,
        author: "user",
        kind: "message",
        body: "I felt a little flat this week.",
        createdAt: now.valueOf() - 2_000,
      });
      await ctx.db.insert("coachMessages", {
        userId: user._id,
        author: "coach",
        kind: "event",
        body: "Draft refreshed with a slightly safer peak week.",
        createdAt: now.valueOf() - 1_000,
      });
      await ctx.db.insert("healthKitWorkouts", {
        userId: user._id,
        externalWorkoutId: "hk-review-1",
        startedAt: now.valueOf() - 90 * 60 * 1000,
        endedAt: now.valueOf() - 40 * 60 * 1000,
        durationSeconds: 3_000,
        distanceMeters: 8_500,
        rawPaceSecondsPerMeter: 0.353,
        historyStatus: "needsReview",
        importedAt: now.valueOf() - 500,
        createdAt: now.valueOf() - 500,
        updatedAt: now.valueOf() - 500,
      });
    });

    const result = await authed.query(api.dashboard.getDashboardView, {
      nowBucketMs: now.valueOf(),
    });

    expect(result.currentVDOT).toBe(50.8);
    expect(result.latestCoachMessage).toMatchObject({
      body: "Draft refreshed with a slightly safer peak week.",
      kind: "event",
    });
    expect(result.activePlan).toBeNull();
    expect(result.nextWorkout).toBeNull();
    expect(result.weekProgress).toBeNull();
    expect(result.pendingActions).toEqual([
      {
        kind: "activateDraft",
        label: "Review draft",
        description: "Fall marathon draft draft is ready to review and activate.",
        draftPlanId: expect.any(String),
      },
      {
        kind: "createPlan",
        label: "Create plan",
        description: "Start a new training plan around a goal, timeline, and preferred volume mode.",
      },
      {
        kind: "reviewHistory",
        label: "Review unmatched run",
        description: "A recent imported run needs review before the coach can reason about it clearly.",
        healthKitWorkoutId: expect.any(String),
      },
    ]);
    expect(result.pastPlan).toMatchObject({
      status: "completed",
      label: "Winter 10K",
      assessment: {
        status: "ready",
        assessment: {
          summary: "You raced well after a steady build.",
        },
        request: null,
      },
    });
  });

  it("surfaces next workout and current pending actions for an active plan", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-03-18T15:30:00.000Z");
    vi.setSystemTime(now);

    const t = createConvexTest();
    const user = await createTestUser(t, {
      currentVDOT: 54.1,
    });
    const authed = asAuthenticatedUser(t, user._id);
    const canonicalTimeZoneId = "America/Chicago";
    const startDateKey = normalizeActivationDateKey(now.valueOf(), canonicalTimeZoneId);

    await t.run(async (ctx) => {
      const activeGoalId = await ctx.db.insert("goals", {
        userId: user._id,
        type: "race",
        label: "Spring Half",
        targetDate: Date.UTC(2026, 4, 10),
        goalTimeSeconds: 5_400,
        createdAt: now.valueOf() - 20_000,
      });
      const draftGoalId = await ctx.db.insert("goals", {
        userId: user._id,
        type: "custom",
        label: "Backup base block",
        createdAt: now.valueOf() - 10_000,
      });
      const activePlanId = await ctx.db.insert("trainingPlans", {
        userId: user._id,
        goalId: activeGoalId,
        startDateKey,
        canonicalTimeZoneId,
        activatedAt: now.valueOf() - 5_000,
        numberOfWeeks: 6,
        volumeMode: "time",
        peakWeekVolume: 360,
        status: "active",
        createdAt: now.valueOf() - 19_000,
        updatedAt: now.valueOf() - 19_000,
      });
      await ctx.db.insert("trainingPlans", {
        userId: user._id,
        goalId: draftGoalId,
        numberOfWeeks: 4,
        volumeMode: "time",
        peakWeekVolume: 280,
        status: "draft",
        createdAt: now.valueOf() - 9_000,
        updatedAt: now.valueOf() - 9_000,
      });
      const weekOneId = await ctx.db.insert("trainingWeeks", {
        planId: activePlanId,
        weekNumber: 1,
        weekStartDateKey: startDateKey,
        weekEndDateKey: "2026-03-22",
        targetVolumePercent: 0.76,
        targetVolumeAbsolute: 274,
        emphasis: "Find rhythm",
        generated: true,
        createdAt: now.valueOf() - 18_000,
        updatedAt: now.valueOf() - 18_000,
      });
      await ctx.db.insert("workouts", {
        planId: activePlanId,
        weekId: weekOneId,
        type: "easyRun",
        volumePercent: 0.18,
        absoluteVolume: 45,
        scheduledDateKey: "2026-03-17",
        venue: "road",
        origin: "planned",
        status: "planned",
        segments: [],
        createdAt: now.valueOf() - 17_000,
        updatedAt: now.valueOf() - 17_000,
      });
      const nextWorkoutId = await ctx.db.insert("workouts", {
        planId: activePlanId,
        weekId: weekOneId,
        type: "tempo",
        volumePercent: 0.24,
        absoluteVolume: 65,
        scheduledDateKey: "2026-03-18",
        venue: "road",
        origin: "planned",
        status: "planned",
        segments: [],
        createdAt: now.valueOf() - 16_000,
        updatedAt: now.valueOf() - 16_000,
      });
      const skippedWorkoutId = await ctx.db.insert("workouts", {
        planId: activePlanId,
        weekId: weekOneId,
        type: "longRun",
        volumePercent: 0.32,
        absoluteVolume: 90,
        scheduledDateKey: "2026-03-19",
        venue: "road",
        origin: "planned",
        status: "skipped",
        segments: [],
        createdAt: now.valueOf() - 15_000,
        updatedAt: now.valueOf() - 15_000,
      });
      const healthKitWorkoutId = await ctx.db.insert("healthKitWorkouts", {
        userId: user._id,
        externalWorkoutId: "hk-match-1",
        startedAt: Date.UTC(2026, 2, 17, 12, 0, 0),
        endedAt: Date.UTC(2026, 2, 17, 12, 40, 0),
        durationSeconds: 2_400,
        distanceMeters: 7_200,
        rawPaceSecondsPerMeter: 0.333,
        historyStatus: "matched",
        importedAt: now.valueOf() - 14_000,
        createdAt: now.valueOf() - 14_000,
        updatedAt: now.valueOf() - 14_000,
      });
      const matchedWorkoutId = await ctx.db
        .query("workouts")
        .withIndex("by_week_id_scheduled_date_key", (queryBuilder) =>
          queryBuilder.eq("weekId", weekOneId).eq("scheduledDateKey", "2026-03-17"),
        )
        .unique();
      if (!matchedWorkoutId) {
        throw new Error("Expected a workout on 2026-03-17.");
      }
      await ctx.db.insert("workoutExecutions", {
        userId: user._id,
        healthKitWorkoutId,
        planId: activePlanId,
        weekId: weekOneId,
        plannedWorkoutId: matchedWorkoutId._id,
        matchStatus: "matched",
        matchMethod: "auto",
        matchConfidence: 0.93,
        matchDateKey: "2026-03-17",
        checkInStatus: "pending",
        modifiers: [],
        feedbackStatus: "pending",
        feedbackAdjustments: [],
        createdAt: now.valueOf() - 13_000,
        updatedAt: now.valueOf() - 13_000,
      });
      await ctx.db.insert("coachMessages", {
        userId: user._id,
        author: "coach",
        kind: "message",
        body: "You handled last week well. Keep this one calm early.",
        createdAt: now.valueOf() - 1_000,
      });
      await ctx.db.insert("healthKitWorkouts", {
        userId: user._id,
        externalWorkoutId: "hk-review-2",
        startedAt: now.valueOf() - 60 * 60 * 1000,
        endedAt: now.valueOf() - 15 * 60 * 1000,
        durationSeconds: 2_700,
        distanceMeters: 7_800,
        rawPaceSecondsPerMeter: 0.346,
        historyStatus: "unplanned",
        importedAt: now.valueOf() - 500,
        createdAt: now.valueOf() - 500,
        updatedAt: now.valueOf() - 500,
      });

      expect(nextWorkoutId).toBeDefined();
      expect(skippedWorkoutId).toBeDefined();
    });

    const result = await authed.query(api.dashboard.getDashboardView, {
      nowBucketMs: now.valueOf(),
    });

    expect(result.currentVDOT).toBe(54.1);
    expect(result.latestCoachMessage).toMatchObject({
      body: "You handled last week well. Keep this one calm early.",
      kind: "message",
    });
    expect(result.activePlan).toMatchObject({
      label: "Spring Half",
      numberOfWeeks: 6,
      volumeMode: "time",
      peakWeekVolume: 360,
      currentWeekNumber: 1,
    });
    expect(result.nextWorkout).toMatchObject({
      scheduledDateKey: "2026-03-18",
      type: "tempo",
      status: "planned",
    });
    expect(result.weekProgress).toEqual({
      weekNumber: 1,
      totalWorkouts: 3,
      completedWorkouts: 1,
      targetVolumeAbsolute: 274,
      targetVolumePercent: 0.76,
      emphasis: "Find rhythm",
    });
    expect(result.pendingActions).toEqual([
      {
        kind: "submitCheckIn",
        label: "Finish post-run check-in",
        description: "One completed workout still needs subjective feedback.",
        workoutId: expect.any(String),
        weekNumber: 1,
      },
      {
        kind: "reviewHistory",
        label: "Review unmatched run",
        description: "Reconcile a recent imported run so history and coach analysis stay accurate.",
        healthKitWorkoutId: expect.any(String),
      },
      {
        kind: "activateDraft",
        label: "Review draft",
        description: "Backup base block draft is ready if you want to switch plans later.",
        draftPlanId: expect.any(String),
      },
    ]);
    expect(result.pastPlan).toBeNull();
  });
});
