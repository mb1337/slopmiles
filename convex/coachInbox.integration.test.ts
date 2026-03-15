// @vitest-environment edge-runtime

import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import { normalizeActivationDateKey } from "./planWeeks";
import { asAuthenticatedUser, createConvexTest, createTestUser } from "./test.setup";

afterEach(() => {
  vi.useRealTimers();
});

describe("coach inbox integration", () => {
  it("assembles active plan, assessment, messages, and unmatched-run context", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-03-18T15:30:00.000Z");
    vi.setSystemTime(now);

    const t = createConvexTest();
    const user = await createTestUser(t, {
      currentVDOT: 52.4,
    });
    const authed = asAuthenticatedUser(t, user._id);
    const canonicalTimeZoneId = "America/Chicago";
    const activePlanStartDateKey = normalizeActivationDateKey(now.valueOf(), canonicalTimeZoneId);

    await t.run(async (ctx) => {
      await ctx.db.insert("runningSchedules", {
        userId: user._id,
        preferredRunningDays: ["monday", "wednesday", "friday", "saturday"],
        runningDaysPerWeek: 4,
        preferredLongRunDay: "saturday",
        preferredQualityDays: ["wednesday"],
        updatedAt: now.valueOf(),
      });
      await ctx.db.insert("competitiveness", {
        userId: user._id,
        level: "aggressive",
        updatedAt: now.valueOf(),
      });
      await ctx.db.insert("personalities", {
        userId: user._id,
        name: "nerd",
        isPreset: true,
        description: "Data-forward with science explanations.",
        updatedAt: now.valueOf(),
      });

      const activeGoalId = await ctx.db.insert("goals", {
        userId: user._id,
        type: "race",
        label: "Chicago Half",
        targetDate: Date.UTC(2026, 8, 20),
        goalTimeSeconds: 5_400,
        createdAt: now.valueOf() - 20_000,
      });
      const pastGoalId = await ctx.db.insert("goals", {
        userId: user._id,
        type: "custom",
        label: "Winter base block",
        targetDate: undefined,
        goalTimeSeconds: undefined,
        createdAt: now.valueOf() - 40_000,
      });
      const draftGoalId = await ctx.db.insert("goals", {
        userId: user._id,
        type: "custom",
        label: "Summer draft",
        targetDate: undefined,
        goalTimeSeconds: undefined,
        createdAt: now.valueOf() - 10_000,
      });

      const activePlanId = await ctx.db.insert("trainingPlans", {
        userId: user._id,
        goalId: activeGoalId,
        startDateKey: activePlanStartDateKey,
        canonicalTimeZoneId,
        activatedAt: now.valueOf() - 5_000,
        numberOfWeeks: 6,
        volumeMode: "time",
        peakWeekVolume: 360,
        status: "active",
        createdAt: now.valueOf() - 19_000,
        updatedAt: now.valueOf(),
      });
      const completedPlanId = await ctx.db.insert("trainingPlans", {
        userId: user._id,
        goalId: pastGoalId,
        startDateKey: "2026-01-05",
        canonicalTimeZoneId,
        activatedAt: now.valueOf() - 5_000_000,
        numberOfWeeks: 8,
        volumeMode: "distance",
        peakWeekVolume: 72_000,
        status: "completed",
        createdAt: now.valueOf() - 30_000,
        updatedAt: now.valueOf() - 29_000,
      });
      await ctx.db.insert("trainingPlans", {
        userId: user._id,
        goalId: draftGoalId,
        numberOfWeeks: 8,
        volumeMode: "time",
        peakWeekVolume: 300,
        status: "draft",
        createdAt: now.valueOf() - 9_000,
        updatedAt: now.valueOf() - 9_000,
      });

      await ctx.db.insert("planAssessments", {
        userId: user._id,
        planId: completedPlanId,
        summary: "You absorbed the block well and finished stronger than you started.",
        volumeAdherence: 0.92,
        paceAdherence: 0.87,
        vdotStart: 49.5,
        vdotEnd: 51.2,
        highlights: ["Long-run consistency improved."],
        areasForImprovement: ["Protect recovery after workouts."],
        nextPlanSuggestion: "Keep building toward a half marathon.",
        discussionPrompts: ["What felt sustainable in the final two weeks?"],
        createdAt: now.valueOf() - 28_000,
        updatedAt: now.valueOf() - 28_000,
      });

      await ctx.db.insert("coachMessages", {
        userId: user._id,
        author: "coach",
        kind: "event",
        body: "Draft activated and week one is ready.",
        planId: activePlanId,
        createdAt: now.valueOf() - 2_000,
      });
      await ctx.db.insert("coachMessages", {
        userId: user._id,
        author: "coach",
        kind: "message",
        body: "Keep tomorrow's run easy if your legs still feel heavy.",
        createdAt: now.valueOf() - 1_000,
      });

      await ctx.db.insert("healthKitWorkouts", {
        userId: user._id,
        externalWorkoutId: "hk-unplanned-1",
        startedAt: now.valueOf() - 60 * 60 * 1000,
        endedAt: now.valueOf() - 10 * 60 * 1000,
        durationSeconds: 3_000,
        distanceMeters: 8_200,
        rawPaceSecondsPerMeter: 0.37,
        gradeAdjustedPaceSecondsPerMeter: 0.365,
        sourceName: "Apple Watch",
        sourceBundleIdentifier: "com.apple.Health",
        historyStatus: "unplanned",
        importedAt: now.valueOf() - 500,
        createdAt: now.valueOf() - 500,
        updatedAt: now.valueOf() - 500,
      });
    });

    const result = await authed.query(api.coachInbox.getCoachInboxView, {
      nowBucketMs: now.valueOf(),
    });

    expect(result.currentVDOT).toBe(52.4);
    expect(result.competitiveness).toBe("aggressive");
    expect(result.personality).toEqual({
      name: "nerd",
      description: "Data-forward with science explanations.",
    });
    expect(result.runningSchedule).toEqual({
      preferredRunningDays: ["monday", "wednesday", "friday", "saturday"],
      runningDaysPerWeek: 4,
      preferredLongRunDay: "saturday",
    });
    expect(result.activePlan).toMatchObject({
      goalLabel: "Chicago Half",
      numberOfWeeks: 6,
      volumeMode: "time",
      peakWeekVolume: 360,
      currentWeekNumber: 1,
    });
    expect(result.latestAssessment).toMatchObject({
      planLabel: "Winter base block",
      planStatus: "completed",
      state: {
        status: "ready",
        assessment: {
          summary: "You absorbed the block well and finished stronger than you started.",
        },
        request: null,
      },
    });
    expect(result.suggestedPrompts).toEqual([
      "Summarize the priority for this week in plain English.",
      "I need to skip today's run. What should I protect this week?",
      "Help me move my long run without wrecking recovery.",
      "Is my current goal still realistic based on the last two weeks?",
      "I logged an extra run. How should it change the rest of my week?",
    ]);
    expect(result.messages.map((message) => message.body)).toEqual([
      "Draft activated and week one is ready.",
      "Keep tomorrow's run easy if your legs still feel heavy.",
    ]);
    expect(result.messages[0]?.cta).toEqual({
      label: "Open plan",
      tab: "plan",
    });
    expect(result.messages[1]?.cta).toEqual({
      label: "Review history",
      tab: "history",
    });
  });
});
