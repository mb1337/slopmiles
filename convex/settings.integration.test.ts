// @vitest-environment edge-runtime

import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import { asAuthenticatedUser, createConvexTest, createTestUser } from "./test.setup";

afterEach(() => {
  vi.useRealTimers();
});

describe("settings integration", () => {
  it("returns a sorted settings view with active-plan and healthkit state", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-03-18T15:30:00.000Z");
    vi.setSystemTime(now);

    const t = createConvexTest();
    const user = await createTestUser(t, {
      healthKitAuthorized: true,
      healthKitLastSyncAt: now.valueOf() - 60_000,
      healthKitLastSyncSource: "background",
      healthKitLastSyncError: "Last import skipped one workout.",
      strengthTrainingEnabled: true,
      strengthEquipment: ["bands", "dumbbells"],
    });
    const authed = asAuthenticatedUser(t, user._id);

    await authed.mutation(api.session.bootstrapSession, {});
    await authed.mutation(api.settings.upsertCourse, {
      name: " Lakefront 5K ",
      distanceMeters: 5_000,
      distanceUnit: "kilometers",
      surface: "road",
      notes: "  Flat and fast.  ",
    });
    await authed.mutation(api.settings.upsertCourse, {
      name: "Track 400",
      distanceMeters: 400,
      distanceUnit: "meters",
      surface: "track",
      notes: undefined,
    });
    await authed.mutation(api.settings.upsertRace, {
      label: "Spring Tune-Up",
      plannedDate: Date.UTC(2026, 3, 1),
      distanceMeters: 5_000,
      goalTimeSeconds: 1_350,
      actualTimeSeconds: undefined,
      isPrimaryGoal: false,
      planId: undefined,
    });
    await authed.mutation(api.settings.upsertRace, {
      label: "Goal Half",
      plannedDate: Date.UTC(2026, 4, 10),
      distanceMeters: 21_097,
      goalTimeSeconds: 5_400,
      actualTimeSeconds: undefined,
      isPrimaryGoal: true,
      planId: undefined,
    });

    await t.run(async (ctx) => {
      const goalId = await ctx.db.insert("goals", {
        userId: user._id,
        type: "race",
        label: "Goal Half",
        targetDate: Date.UTC(2026, 4, 10),
        goalTimeSeconds: 5_400,
        createdAt: now.valueOf() - 10_000,
      });
      await ctx.db.insert("trainingPlans", {
        userId: user._id,
        goalId,
        numberOfWeeks: 10,
        volumeMode: "time",
        peakWeekVolume: 360,
        status: "active",
        createdAt: now.valueOf() - 9_000,
        updatedAt: now.valueOf() - 9_000,
      });
    });

    const result = await authed.query(api.settings.getSettingsView, {});

    expect(result.strengthPreference).toEqual({
      enabled: true,
      equipment: ["bands", "dumbbells"],
    });
    expect(result.hasActivePlan).toBe(true);
    expect(result.healthKit).toEqual({
      authorized: true,
      lastSyncAt: now.valueOf() - 60_000,
      lastSyncSource: "background",
      lastSyncError: "Last import skipped one workout.",
    });
    expect(result.courses.map((course) => course.name)).toEqual(["Lakefront 5K", "Track 400"]);
    expect(result.courses[0]?.notes).toBe("Flat and fast.");
    expect(result.races.map((race) => race.label)).toEqual(["Goal Half", "Spring Tune-Up"]);
  });

  it("exports only data linked to the authenticated user's plans and profile", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-03-18T15:30:00.000Z");
    vi.setSystemTime(now);

    const t = createConvexTest();
    const user = await createTestUser(t, {
      strengthTrainingEnabled: true,
      strengthEquipment: ["bands"],
    });
    const otherUser = await createTestUser(t, {
      email: "other-runner@example.com",
    });
    const authed = asAuthenticatedUser(t, user._id);

    await t.run(async (ctx) => {
      await ctx.db.insert("runningSchedules", {
        userId: user._id,
        preferredRunningDays: ["monday", "wednesday", "friday"],
        runningDaysPerWeek: 3,
        preferredLongRunDay: "friday",
        preferredQualityDays: ["wednesday"],
        updatedAt: now.valueOf(),
      });
      await ctx.db.insert("competitiveness", {
        userId: user._id,
        level: "balanced",
        updatedAt: now.valueOf(),
      });
      await ctx.db.insert("personalities", {
        userId: user._id,
        name: "noNonsense",
        isPreset: true,
        description: "Brief, direct, no fluff.",
        updatedAt: now.valueOf(),
      });

      const userGoalId = await ctx.db.insert("goals", {
        userId: user._id,
        type: "race",
        label: "User Goal",
        targetDate: Date.UTC(2026, 4, 10),
        goalTimeSeconds: 5_400,
        createdAt: now.valueOf() - 20_000,
      });
      const userPlanId = await ctx.db.insert("trainingPlans", {
        userId: user._id,
        goalId: userGoalId,
        numberOfWeeks: 4,
        volumeMode: "time",
        peakWeekVolume: 320,
        status: "active",
        createdAt: now.valueOf() - 19_000,
        updatedAt: now.valueOf() - 19_000,
      });
      const userWeekId = await ctx.db.insert("trainingWeeks", {
        planId: userPlanId,
        weekNumber: 1,
        weekStartDateKey: "2026-03-16",
        weekEndDateKey: "2026-03-22",
        targetVolumePercent: 0.75,
        targetVolumeAbsolute: 240,
        emphasis: "Steady start",
        generated: true,
        createdAt: now.valueOf() - 18_000,
        updatedAt: now.valueOf() - 18_000,
      });
      await ctx.db.insert("workouts", {
        planId: userPlanId,
        weekId: userWeekId,
        type: "easyRun",
        volumePercent: 0.2,
        absoluteVolume: 45,
        scheduledDateKey: "2026-03-17",
        venue: "road",
        origin: "planned",
        status: "planned",
        segments: [],
        createdAt: now.valueOf() - 17_000,
        updatedAt: now.valueOf() - 17_000,
      });
      const userHealthKitWorkoutId = await ctx.db.insert("healthKitWorkouts", {
        userId: user._id,
        externalWorkoutId: "hk-user-1",
        startedAt: Date.UTC(2026, 2, 17, 12, 0, 0),
        endedAt: Date.UTC(2026, 2, 17, 12, 45, 0),
        durationSeconds: 2_700,
        distanceMeters: 8_000,
        historyStatus: "matched",
        importedAt: now.valueOf() - 16_000,
        createdAt: now.valueOf() - 16_000,
        updatedAt: now.valueOf() - 16_000,
      });
      await ctx.db.insert("workoutExecutions", {
        userId: user._id,
        healthKitWorkoutId: userHealthKitWorkoutId,
        planId: userPlanId,
        weekId: userWeekId,
        matchStatus: "matched",
        matchMethod: "auto",
        checkInStatus: "pending",
        modifiers: [],
        feedbackStatus: "pending",
        feedbackAdjustments: [],
        createdAt: now.valueOf() - 15_000,
        updatedAt: now.valueOf() - 15_000,
      });
      await ctx.db.insert("courses", {
        userId: user._id,
        name: "User Course",
        distanceMeters: 5_000,
        distanceUnit: "kilometers",
        surface: "road",
        createdAt: now.valueOf() - 14_000,
        updatedAt: now.valueOf() - 14_000,
      });
      await ctx.db.insert("races", {
        userId: user._id,
        label: "User Race",
        plannedDate: Date.UTC(2026, 4, 10),
        distanceMeters: 21_097,
        isPrimaryGoal: true,
        planId: userPlanId,
        createdAt: now.valueOf() - 13_000,
        updatedAt: now.valueOf() - 13_000,
      });
      await ctx.db.insert("planAssessments", {
        userId: user._id,
        planId: userPlanId,
        summary: "On track.",
        volumeAdherence: 0.9,
        paceAdherence: 0.88,
        vdotStart: 50,
        vdotEnd: 51,
        highlights: ["Consistency stayed high."],
        areasForImprovement: ["Keep long-run fueling simple."],
        nextPlanSuggestion: "Build toward specific half-marathon work.",
        discussionPrompts: ["What felt repeatable?"],
        createdAt: now.valueOf() - 12_000,
        updatedAt: now.valueOf() - 12_000,
      });

      const otherGoalId = await ctx.db.insert("goals", {
        userId: otherUser._id,
        type: "custom",
        label: "Other Goal",
        createdAt: now.valueOf() - 20_000,
      });
      const otherPlanId = await ctx.db.insert("trainingPlans", {
        userId: otherUser._id,
        goalId: otherGoalId,
        numberOfWeeks: 4,
        volumeMode: "distance",
        peakWeekVolume: 60_000,
        status: "active",
        createdAt: now.valueOf() - 19_000,
        updatedAt: now.valueOf() - 19_000,
      });
      const otherWeekId = await ctx.db.insert("trainingWeeks", {
        planId: otherPlanId,
        weekNumber: 1,
        weekStartDateKey: "2026-03-16",
        weekEndDateKey: "2026-03-22",
        targetVolumePercent: 0.7,
        targetVolumeAbsolute: 42_000,
        emphasis: "Other user week",
        generated: true,
        createdAt: now.valueOf() - 18_000,
        updatedAt: now.valueOf() - 18_000,
      });
      await ctx.db.insert("workouts", {
        planId: otherPlanId,
        weekId: otherWeekId,
        type: "longRun",
        volumePercent: 0.3,
        absoluteVolume: 18_000,
        scheduledDateKey: "2026-03-20",
        venue: "road",
        origin: "planned",
        status: "planned",
        segments: [],
        createdAt: now.valueOf() - 17_000,
        updatedAt: now.valueOf() - 17_000,
      });
    });

    const result = await authed.query(api.settings.exportData, {});

    expect(result.profile?._id).toBe(user._id);
    expect(result.strengthPreference).toEqual({
      enabled: true,
      equipment: ["bands"],
    });
    expect(result.goals).toHaveLength(1);
    expect(result.goals[0]?.label).toBe("User Goal");
    expect(result.plans).toHaveLength(1);
    expect(result.plans[0]?.userId).toBe(user._id);
    expect(result.weeks).toHaveLength(1);
    expect(result.weeks[0]?.emphasis).toBe("Steady start");
    expect(result.workouts).toHaveLength(1);
    expect(result.workouts[0]?.scheduledDateKey).toBe("2026-03-17");
    expect(result.executions).toHaveLength(1);
    expect(result.executions[0]?.userId).toBe(user._id);
    expect(result.healthKitWorkouts).toHaveLength(1);
    expect(result.healthKitWorkouts[0]?.externalWorkoutId).toBe("hk-user-1");
    expect(result.races).toHaveLength(1);
    expect(result.races[0]?.label).toBe("User Race");
    expect(result.courses).toHaveLength(1);
    expect(result.courses[0]?.name).toBe("User Course");
    expect(result.assessments).toHaveLength(1);
    expect(result.assessments[0]?.summary).toBe("On track.");
  });
});
