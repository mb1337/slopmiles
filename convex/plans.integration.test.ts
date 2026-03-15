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
});
