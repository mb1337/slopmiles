// @vitest-environment edge-runtime

import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import { normalizeActivationDateKey } from "./planWeeks";
import {
  asAuthenticatedUser,
  createConvexTest,
  createTestUser,
  getAiRequestsForUser,
  getCoachMessagesForUser,
  getGoalsForUser,
  getPlansForUser,
  getTrainingWeeksForPlan,
} from "./test.setup";

afterEach(() => {
  vi.useRealTimers();
});

describe("plans integration", () => {
  it("creates an active plan first and a draft when an active plan already exists", async () => {
    const t = createConvexTest();
    const user = await createTestUser(t);
    const authed = asAuthenticatedUser(t, user._id);

    const firstResult = await authed.mutation(api.plans.createPlan, {
      goalType: "race",
      goalLabel: "Spring 10K",
      targetDate: Date.UTC(2026, 4, 2),
      goalTimeSeconds: 2_700,
      numberOfWeeks: 8,
      volumeMode: "time",
      peakWeekVolume: 320,
    });

    const secondResult = await authed.mutation(api.plans.createPlan, {
      goalType: "custom",
      goalLabel: "Summer base block",
      targetDate: undefined,
      goalTimeSeconds: undefined,
      numberOfWeeks: 6,
      volumeMode: "distance",
      peakWeekVolume: 72_000,
    });

    const [plans, goals] = await Promise.all([
      getPlansForUser(t, user._id),
      getGoalsForUser(t, user._id),
    ]);
    const statuses = plans
      .map((plan) => plan.status)
      .sort((left, right) => left.localeCompare(right));

    expect(firstResult.status).toBe("active");
    expect(firstResult.createdAsDraft).toBe(false);
    expect(firstResult.activePlanId).toBeNull();
    expect(firstResult.plan?.status).toBe("active");

    expect(secondResult.status).toBe("draft");
    expect(secondResult.createdAsDraft).toBe(true);
    expect(secondResult.activePlanId).toBe(firstResult.plan?._id ?? null);
    expect(secondResult.plan?.status).toBe("draft");

    expect(plans).toHaveLength(2);
    expect(goals).toHaveLength(2);
    expect(statuses).toEqual(["active", "draft"]);
  });

  it("activates a draft plan, seeds weeks, and queues week detail generation", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-03-18T15:30:00.000Z");
    vi.setSystemTime(now);

    const t = createConvexTest();
    const user = await createTestUser(t);
    const authed = asAuthenticatedUser(t, user._id);
    const canonicalTimeZoneId = "America/Chicago";

    const { draftPlanId } = await t.run(async (ctx) => {
      const goalId = await ctx.db.insert("goals", {
        userId: user._id,
        type: "race",
        label: "Chicago Half",
        targetDate: Date.UTC(2026, 8, 20),
        goalTimeSeconds: 5_400,
        createdAt: now.valueOf(),
      });
      const draftPlanId = await ctx.db.insert("trainingPlans", {
        userId: user._id,
        goalId,
        numberOfWeeks: 4,
        volumeMode: "time",
        peakWeekVolume: 300,
        status: "draft",
        createdAt: now.valueOf(),
        updatedAt: now.valueOf(),
      });

      return { draftPlanId };
    });

    const result = await authed.mutation(api.plans.activateDraftPlan, {
      planId: draftPlanId,
      canonicalTimeZoneId,
    });

    const [plans, trainingWeeks, coachMessages, aiRequests] = await Promise.all([
      getPlansForUser(t, user._id),
      getTrainingWeeksForPlan(t, draftPlanId),
      getCoachMessagesForUser(t, user._id),
      getAiRequestsForUser(t, user._id),
    ]);
    const activatedPlan = plans.find((plan) => plan._id === draftPlanId);
    const expectedStartDateKey = normalizeActivationDateKey(now.valueOf(), canonicalTimeZoneId);
    const weekDetailRequests = aiRequests.filter((request) => request.callType === "weekDetailGeneration");
    const activationEvent = coachMessages.find(
      (message) =>
        message.kind === "event" &&
        message.planId === draftPlanId &&
        message.body.includes("Draft activated"),
    );

    expect(result).toEqual({
      activatedPlanId: draftPlanId,
      currentWeekNumber: 1,
    });

    expect(activatedPlan).toMatchObject({
      _id: draftPlanId,
      status: "active",
      canonicalTimeZoneId,
      startDateKey: expectedStartDateKey,
      activatedAt: now.valueOf(),
      updatedAt: now.valueOf(),
    });

    expect(trainingWeeks).toHaveLength(4);
    expect(trainingWeeks.map((week) => week.weekNumber).sort((left, right) => left - right)).toEqual([1, 2, 3, 4]);
    expect(trainingWeeks.every((week) => week.planId === draftPlanId)).toBe(true);
    expect(trainingWeeks[0]?.weekStartDateKey).toBe(expectedStartDateKey);

    expect(activationEvent).toBeDefined();

    expect(weekDetailRequests).toHaveLength(1);
    expect(weekDetailRequests[0]).toMatchObject({
      userId: user._id,
      callType: "weekDetailGeneration",
      status: "queued",
      priority: "userBlocking",
      input: {
        planId: draftPlanId,
        weekNumber: 1,
      },
    });
  });

  it("returns a week detail view with sorted workouts, matched executions, and the latest request", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-03-18T15:30:00.000Z");
    vi.setSystemTime(now);

    const t = createConvexTest();
    const user = await createTestUser(t);
    const authed = asAuthenticatedUser(t, user._id);
    const canonicalTimeZoneId = "America/Chicago";
    const weekStartDateKey = normalizeActivationDateKey(now.valueOf(), canonicalTimeZoneId);

    const { activePlanId, weekId, firstWorkoutId, matchedWorkoutId } = await t.run(async (ctx) => {
      const goalId = await ctx.db.insert("goals", {
        userId: user._id,
        type: "race",
        label: "Spring 10K",
        targetDate: Date.UTC(2026, 4, 2),
        goalTimeSeconds: 2_700,
        createdAt: now.valueOf(),
      });
      const activePlanId = await ctx.db.insert("trainingPlans", {
        userId: user._id,
        goalId,
        startDateKey: weekStartDateKey,
        canonicalTimeZoneId,
        activatedAt: now.valueOf() - 10_000,
        numberOfWeeks: 4,
        volumeMode: "time",
        peakWeekVolume: 320,
        status: "active",
        createdAt: now.valueOf() - 20_000,
        updatedAt: now.valueOf(),
      });
      const weekId = await ctx.db.insert("trainingWeeks", {
        planId: activePlanId,
        weekNumber: 1,
        weekStartDateKey,
        weekEndDateKey: "2026-03-22",
        targetVolumePercent: 0.75,
        targetVolumeAbsolute: 240,
        vdotAtGeneration: 52.7,
        emphasis: "Settle into the block",
        coachNotes: "Keep the easy days easy.",
        generated: true,
        createdAt: now.valueOf() - 19_000,
        updatedAt: now.valueOf() - 19_000,
      });
      await ctx.db.insert("trainingWeeks", {
        planId: activePlanId,
        weekNumber: 2,
        weekStartDateKey: "2026-03-23",
        weekEndDateKey: "2026-03-29",
        targetVolumePercent: 0.82,
        targetVolumeAbsolute: 262,
        emphasis: "Build",
        generated: false,
        createdAt: now.valueOf() - 18_000,
        updatedAt: now.valueOf() - 18_000,
      });

      const matchedWorkoutId = await ctx.db.insert("workouts", {
        planId: activePlanId,
        weekId,
        type: "tempo",
        volumePercent: 0.3,
        absoluteVolume: 70,
        scheduledDateKey: "2026-03-18",
        notes: "Controlled, not all-out.",
        venue: "road",
        origin: "planned",
        status: "planned",
        segments: [
          {
            order: 1,
            label: "Tempo",
            paceZone: "threshold",
            targetValue: 20,
            targetUnit: "seconds",
          },
        ],
        createdAt: now.valueOf() - 17_000,
        updatedAt: now.valueOf() - 17_000,
      });
      const firstWorkoutId = await ctx.db.insert("workouts", {
        planId: activePlanId,
        weekId,
        type: "easyRun",
        volumePercent: 0.2,
        absoluteVolume: 45,
        scheduledDateKey: "2026-03-17",
        notes: "Stay conversational.",
        venue: "road",
        origin: "planned",
        status: "planned",
        segments: [],
        createdAt: now.valueOf() - 16_000,
        updatedAt: now.valueOf() - 16_000,
      });

      const healthKitWorkoutId = await ctx.db.insert("healthKitWorkouts", {
        userId: user._id,
        externalWorkoutId: "hk-matched-1",
        startedAt: Date.UTC(2026, 2, 18, 12, 0, 0),
        endedAt: Date.UTC(2026, 2, 18, 12, 42, 0),
        durationSeconds: 2_520,
        distanceMeters: 8_000,
        rawPaceSecondsPerMeter: 0.315,
        gradeAdjustedPaceSecondsPerMeter: 0.31,
        averageHeartRate: 164,
        historyStatus: "matched",
        importedAt: now.valueOf() - 15_000,
        createdAt: now.valueOf() - 15_000,
        updatedAt: now.valueOf() - 15_000,
      });
      await ctx.db.insert("workoutExecutions", {
        userId: user._id,
        healthKitWorkoutId,
        planId: activePlanId,
        weekId,
        plannedWorkoutId: matchedWorkoutId,
        matchStatus: "matched",
        matchMethod: "auto",
        matchConfidence: 0.94,
        matchDateKey: "2026-03-18",
        checkInStatus: "submitted",
        rpe: 6,
        modifiers: [],
        notes: "Felt smooth.",
        feedbackStatus: "ready",
        feedbackCommentary: "Good control throughout.",
        feedbackAdjustments: ["Keep the next recovery day relaxed."],
        createdAt: now.valueOf() - 14_000,
        updatedAt: now.valueOf() - 14_000,
      });

      await ctx.db.insert("aiRequests", {
        userId: user._id,
        callType: "weekDetailGeneration",
        status: "queued",
        priority: "userBlocking",
        dedupeKey: "week-1-old",
        input: {
          planId: activePlanId,
          weekNumber: 1,
        },
        attemptCount: 0,
        maxAttempts: 1,
        promptRevision: "week-detail-v1",
        schemaRevision: "week-detail-v1",
        createdAt: now.valueOf() - 13_000,
        updatedAt: now.valueOf() - 13_000,
      });
      await ctx.db.insert("aiRequests", {
        userId: user._id,
        callType: "weekDetailGeneration",
        status: "succeeded",
        priority: "interactive",
        dedupeKey: "week-2",
        input: {
          planId: activePlanId,
          weekNumber: 2,
        },
        attemptCount: 1,
        maxAttempts: 1,
        promptRevision: "week-detail-v1",
        schemaRevision: "week-detail-v1",
        completedAt: now.valueOf() - 12_000,
        createdAt: now.valueOf() - 12_000,
        updatedAt: now.valueOf() - 12_000,
      });
      await ctx.db.insert("aiRequests", {
        userId: user._id,
        callType: "weekDetailGeneration",
        status: "failed",
        priority: "interactive",
        dedupeKey: "week-1-latest",
        input: {
          planId: activePlanId,
          weekNumber: 1,
        },
        errorMessage: "Model output failed validation.",
        attemptCount: 1,
        maxAttempts: 1,
        promptRevision: "week-detail-v1",
        schemaRevision: "week-detail-v1",
        createdAt: now.valueOf() - 11_000,
        updatedAt: now.valueOf() - 11_000,
      });

      return { activePlanId, weekId, firstWorkoutId, matchedWorkoutId };
    });

    const result = await authed.query(api.plans.getWeekDetail, {
      planId: activePlanId,
      weekNumber: 1,
    });

    expect(result.plan).toMatchObject({
      _id: activePlanId,
      numberOfWeeks: 4,
      volumeMode: "time",
      peakWeekVolume: 320,
      startDateKey: weekStartDateKey,
      canonicalTimeZoneId,
    });
    expect(result.week).toMatchObject({
      _id: weekId,
      weekNumber: 1,
      weekStartDateKey,
      weekEndDateKey: "2026-03-22",
      targetVolumePercent: 0.75,
      targetVolumeAbsolute: 240,
      emphasis: "Settle into the block",
      coachNotes: "Keep the easy days easy.",
      generated: true,
    });
    expect(result.workouts.map((workout) => workout._id)).toEqual([firstWorkoutId, matchedWorkoutId]);
    expect(result.workouts[0]).toMatchObject({
      _id: firstWorkoutId,
      scheduledDateKey: "2026-03-17",
      status: "planned",
      execution: null,
    });
    expect(result.workouts[1]).toMatchObject({
      _id: matchedWorkoutId,
      scheduledDateKey: "2026-03-18",
      status: "completed",
      execution: {
        plannedWorkoutId: matchedWorkoutId,
        matchStatus: "matched",
        matchMethod: "auto",
        matchConfidence: 0.94,
        checkInStatus: "submitted",
        notes: "Felt smooth.",
        feedback: {
          status: "ready",
          commentary: "Good control throughout.",
          adjustments: ["Keep the next recovery day relaxed."],
        },
      },
    });
    expect(result.latestRequest).toMatchObject({
      status: "failed",
      errorMessage: "Model output failed validation.",
    });
    expect(result.currentWeekNumber).toBe(1);
    expect(result.canGenerate).toBe(true);
  });

  it("finds the matching week-detail request even when it is older than the newest 50", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-03-18T15:30:00.000Z");
    vi.setSystemTime(now);

    const t = createConvexTest();
    const user = await createTestUser(t);
    const authed = asAuthenticatedUser(t, user._id);

    const { planId } = await t.run(async (ctx) => {
      const goalId = await ctx.db.insert("goals", {
        userId: user._id,
        type: "race",
        label: "Older request plan",
        createdAt: now.valueOf(),
      });
      const planId = await ctx.db.insert("trainingPlans", {
        userId: user._id,
        goalId,
        numberOfWeeks: 4,
        volumeMode: "time",
        peakWeekVolume: 300,
        status: "active",
        startDateKey: "2026-03-16",
        canonicalTimeZoneId: "America/Chicago",
        activatedAt: now.valueOf(),
        createdAt: now.valueOf(),
        updatedAt: now.valueOf(),
      });
      await ctx.db.insert("trainingWeeks", {
        planId,
        weekNumber: 1,
        weekStartDateKey: "2026-03-16",
        weekEndDateKey: "2026-03-22",
        targetVolumePercent: 0.75,
        targetVolumeAbsolute: 225,
        emphasis: "Week one",
        generated: false,
        createdAt: now.valueOf(),
        updatedAt: now.valueOf(),
      });

      await ctx.db.insert("aiRequests", {
        userId: user._id,
        callType: "weekDetailGeneration",
        status: "failed",
        priority: "userBlocking",
        dedupeKey: "target",
        input: {
          planId,
          weekNumber: 1,
        },
        attemptCount: 1,
        maxAttempts: 1,
        promptRevision: "week-detail-v1",
        schemaRevision: "week-detail-v1",
        errorMessage: "Older matching request",
        createdAt: now.valueOf() - 10_000,
        updatedAt: now.valueOf() - 10_000,
      });

      for (let index = 0; index < 55; index += 1) {
        await ctx.db.insert("aiRequests", {
          userId: user._id,
          callType: "weekDetailGeneration",
          status: "queued",
          priority: "userBlocking",
          dedupeKey: `noise-${index}`,
          input: {
            planId,
            weekNumber: index + 2,
          },
          attemptCount: 0,
          maxAttempts: 1,
          promptRevision: "week-detail-v1",
          schemaRevision: "week-detail-v1",
          createdAt: now.valueOf() - index,
          updatedAt: now.valueOf() - index,
        });
      }

      return { planId };
    });

    const result = await authed.query(api.weekDetail.getWeekDetailView, {
      planId,
      weekNumber: 1,
      nowBucketMs: now.valueOf(),
    });

    expect(result.latestRequest).toMatchObject({
      status: "failed",
      errorMessage: "Older matching request",
    });
  });
});
