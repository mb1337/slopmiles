import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { deriveCurrentWeekNumber, isWeekGeneratable } from "./planWeeks";
import { getExecutionDetailRecord, listExecutionSummariesByHealthKitWorkoutId, listExecutionSummariesByPlannedWorkoutId } from "./workoutExecutionHelpers";
import { addDays, dateKeyFromEpochMs, type DateKey } from "../packages/domain/src/calendar";
import {
  distanceUnits,
  goalTypes,
  planInterruptionTypes,
  strengthEquipmentOptions,
  surfaceTypes,
  weekdays,
} from "./constants";

const weekdayValidator = v.union(...weekdays.map((day) => v.literal(day)));
const strengthEquipmentValidator = v.union(...strengthEquipmentOptions.map((item) => v.literal(item)));
const distanceUnitValidator = v.union(...distanceUnits.map((item) => v.literal(item)));
const surfaceTypeValidator = v.union(...surfaceTypes.map((item) => v.literal(item)));
const goalTypeValidator = v.union(...goalTypes.map((item) => v.literal(item)));
const planInterruptionTypeValidator = v.union(...planInterruptionTypes.map((item) => v.literal(item)));

async function requireAuthenticatedUserId(ctx: QueryCtx | MutationCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Authentication required.");
  }

  return userId;
}

async function insertCoachEvent(
  ctx: MutationCtx,
  userId: Id<"users">,
  body: string,
  planId?: Id<"trainingPlans">,
  cta?: { label: string; tab: "plan" | "history" | "settings" | "coach" },
) {
  await ctx.db.insert("coachMessages", {
    userId,
    author: "coach",
    kind: "event",
    body,
    planId,
    cta,
    createdAt: Date.now(),
  });
}

function formatWorkoutType(type: Doc<"workouts">["type"]): string {
  switch (type) {
    case "easyRun":
      return "Easy Run";
    case "longRun":
      return "Long Run";
    case "tempo":
      return "Tempo";
    case "intervals":
      return "Intervals";
    case "recovery":
      return "Recovery";
    default:
      return type;
  }
}

function formatPlannedVolume(plan: Doc<"trainingPlans">, absoluteVolume: number): string {
  if (plan.volumeMode === "time") {
    return `${Math.round(absoluteVolume / 60)} min`;
  }

  return `${Math.round(absoluteVolume)} m`;
}

async function loadActivePlan(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  const plans = await ctx.db
    .query("trainingPlans")
    .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
    .collect();

  return plans.find((plan) => plan.status === "active") ?? null;
}

async function loadPlanGoal(ctx: QueryCtx | MutationCtx, plan: Doc<"trainingPlans"> | null) {
  if (!plan) {
    return null;
  }

  return await ctx.db.get(plan.goalId);
}

async function loadPlanWeek(
  ctx: QueryCtx | MutationCtx,
  planId: Id<"trainingPlans">,
  weekNumber: number,
) {
  return await ctx.db
    .query("trainingWeeks")
    .withIndex("by_plan_id_week_number", (queryBuilder) =>
      queryBuilder.eq("planId", planId).eq("weekNumber", Math.round(weekNumber)),
    )
    .unique();
}

function normalizeAvailabilityOverride(
  value: unknown,
): {
  preferredRunningDays?: string[];
  availabilityWindows?: Record<string, Array<{ start: string; end: string }>>;
  note?: string;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as {
    preferredRunningDays?: unknown;
    availabilityWindows?: unknown;
    note?: unknown;
  };

  return {
    ...(Array.isArray(candidate.preferredRunningDays)
      ? {
          preferredRunningDays: candidate.preferredRunningDays.filter(
            (entry): entry is string => typeof entry === "string",
          ),
        }
      : {}),
    ...(candidate.availabilityWindows && typeof candidate.availabilityWindows === "object" && !Array.isArray(candidate.availabilityWindows)
      ? { availabilityWindows: candidate.availabilityWindows as Record<string, Array<{ start: string; end: string }>> }
      : {}),
    ...(typeof candidate.note === "string" && candidate.note.trim().length > 0 ? { note: candidate.note.trim() } : {}),
  };
}

export const getSessionState = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const [user, runningSchedule, onboardingState, competitiveness, personality] = await Promise.all([
      ctx.db.get(userId),
      ctx.db
        .query("runningSchedules")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
        .unique(),
      ctx.db
        .query("onboardingStates")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
        .unique(),
      ctx.db
        .query("competitiveness")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
        .unique(),
      ctx.db
        .query("personalities")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
        .unique(),
    ]);

    return {
      user,
      runningSchedule,
      onboardingState,
      competitiveness,
      personality,
      strengthPreference: {
        enabled: user?.strengthTrainingEnabled ?? false,
        equipment: user?.strengthEquipment ?? [],
      },
    };
  },
});

export const getDashboardView = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const [user, activePlan, messages] = await Promise.all([
      ctx.db.get(userId),
      loadActivePlan(ctx, userId),
      ctx.db
        .query("coachMessages")
        .withIndex("by_user_id_created_at", (queryBuilder) => queryBuilder.eq("userId", userId))
        .collect(),
    ]);

    const activeGoal = await loadPlanGoal(ctx, activePlan);
    const currentWeek =
      activePlan && activePlan.startDateKey
        ? await loadPlanWeek(ctx, activePlan._id, deriveCurrentWeekNumber(activePlan, Date.now()) ?? 1)
        : null;
    const weekWorkouts = currentWeek
      ? await ctx.db
          .query("workouts")
          .withIndex("by_week_id_scheduled_date_key", (queryBuilder) => queryBuilder.eq("weekId", currentWeek._id))
          .collect()
      : [];
    const executionByWorkoutId = await listExecutionSummariesByPlannedWorkoutId(ctx, userId);
    const nextWorkout =
      weekWorkouts
        .sort((left, right) => left.scheduledDateKey.localeCompare(right.scheduledDateKey))
        .find((workout) => (executionByWorkoutId.get(String(workout._id))?.matchStatus ?? "unmatched") !== "matched") ?? null;
    const latestCoachMessage = [...messages].reverse().find((message) => message.author === "coach") ?? null;
    const completedWorkouts = weekWorkouts.filter(
      (workout) => executionByWorkoutId.get(String(workout._id))?.matchStatus === "matched" || workout.status === "completed",
    ).length;

    return {
      athlete: {
        name: user?.name ?? "Runner",
        currentVDOT: user?.currentVDOT ?? null,
      },
      activePlan: activePlan
        ? {
            _id: activePlan._id,
            goalLabel: activeGoal?.label ?? "Current plan",
            numberOfWeeks: activePlan.numberOfWeeks,
            currentWeekNumber: deriveCurrentWeekNumber(activePlan, Date.now()),
            peakWeekVolume: activePlan.peakWeekVolume,
            volumeMode: activePlan.volumeMode,
          }
        : null,
      nextWorkout: activePlan && nextWorkout
        ? {
            _id: nextWorkout._id,
            type: nextWorkout.type,
            title: formatWorkoutType(nextWorkout.type),
            scheduledDateKey: nextWorkout.scheduledDateKey,
            absoluteVolumeLabel: formatPlannedVolume(activePlan, nextWorkout.absoluteVolume),
            notes: nextWorkout.notes,
            segments: nextWorkout.segments,
          }
        : null,
      weekProgress: currentWeek
        ? {
            weekNumber: currentWeek.weekNumber,
            completedWorkouts,
            totalWorkouts: weekWorkouts.length,
            targetVolumeAbsolute: currentWeek.targetVolumeAbsolute,
            targetVolumePercent: currentWeek.targetVolumePercent,
            emphasis: currentWeek.emphasis,
          }
        : null,
      latestCoachMessage: latestCoachMessage
        ? {
            _id: latestCoachMessage._id,
            body: latestCoachMessage.body,
            createdAt: latestCoachMessage.createdAt,
          }
        : null,
    };
  },
});

export const getPlanView = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const [plans, requests] = await Promise.all([
      ctx.db
        .query("trainingPlans")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
        .collect(),
      ctx.db
        .query("aiRequests")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
        .collect(),
    ]);

    const sortedPlans = [...plans].sort((left, right) => right.createdAt - left.createdAt);
    const activePlan = sortedPlans.find((plan) => plan.status === "active") ?? null;
    const draftPlans = sortedPlans.filter((plan) => plan.status === "draft");
    const pastPlans = sortedPlans.filter((plan) => plan.status === "completed" || plan.status === "abandoned");
    const targetPlan = activePlan ?? draftPlans[0] ?? null;

    const [goal, weeks, peakVolumeChanges, goalChanges, races] = targetPlan
      ? await Promise.all([
          ctx.db.get(targetPlan.goalId),
          ctx.db
            .query("trainingWeeks")
            .withIndex("by_plan_id", (queryBuilder) => queryBuilder.eq("planId", targetPlan._id))
            .collect(),
          ctx.db
            .query("peakVolumeChanges")
            .withIndex("by_plan_id", (queryBuilder) => queryBuilder.eq("planId", targetPlan._id))
            .collect(),
          ctx.db
            .query("goalChanges")
            .withIndex("by_plan_id", (queryBuilder) => queryBuilder.eq("planId", targetPlan._id))
            .collect(),
          ctx.db
            .query("races")
            .withIndex("by_plan_id", (queryBuilder) => queryBuilder.eq("planId", targetPlan._id))
            .collect(),
        ])
      : [null, [], [], [], []];

    const latestProposal =
      requests
        .filter((request) => request.callType === "planGeneration")
        .sort((left, right) => right.createdAt - left.createdAt)[0] ?? null;

    return {
      activePlan: targetPlan
        ? {
            ...targetPlan,
            goalLabel: goal?.label ?? "Current plan",
            goalType: goal?.type ?? "race",
            targetDate: goal?.targetDate ?? null,
            goalTimeSeconds: goal?.goalTimeSeconds ?? null,
            currentWeekNumber: targetPlan.startDateKey ? deriveCurrentWeekNumber(targetPlan, Date.now()) : null,
            weeks: weeks
              .sort((left, right) => left.weekNumber - right.weekNumber)
              .map((week) => ({
                _id: week._id,
                weekNumber: week.weekNumber,
                weekStartDateKey: week.weekStartDateKey,
                weekEndDateKey: week.weekEndDateKey,
                targetVolumePercent: week.targetVolumePercent,
                targetVolumeAbsolute: week.targetVolumeAbsolute,
                emphasis: week.emphasis,
                coachNotes: week.coachNotes,
                generated: week.generated,
                interruptionType: week.interruptionType ?? null,
              })),
            peakVolumeChanges,
            goalChanges,
            races: races.sort((left, right) => left.plannedDate - right.plannedDate),
          }
        : null,
      draftPlans,
      pastPlans,
      latestProposal,
    };
  },
});

export const getWeekView = query({
  args: {
    planId: v.id("trainingPlans"),
    weekNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const plan = await ctx.db.get(args.planId);
    if (!plan || plan.userId !== userId) {
      throw new Error("Plan not found.");
    }

    const week = await loadPlanWeek(ctx, plan._id, args.weekNumber);
    if (!week) {
      throw new Error("Week not found.");
    }

    const [goal, workouts, strengthWorkouts, races, executionByWorkoutId] = await Promise.all([
      ctx.db.get(plan.goalId),
      ctx.db
        .query("workouts")
        .withIndex("by_week_id_scheduled_date_key", (queryBuilder) => queryBuilder.eq("weekId", week._id))
        .collect(),
      ctx.db
        .query("strengthWorkouts")
        .withIndex("by_week_id", (queryBuilder) => queryBuilder.eq("weekId", week._id))
        .collect(),
      ctx.db
        .query("races")
        .withIndex("by_plan_id", (queryBuilder) => queryBuilder.eq("planId", plan._id))
        .collect(),
      listExecutionSummariesByPlannedWorkoutId(ctx, userId),
    ]);

    return {
      plan: {
        _id: plan._id,
        goalLabel: goal?.label ?? "Current plan",
        status: plan.status,
        volumeMode: plan.volumeMode,
        currentWeekNumber: plan.startDateKey ? deriveCurrentWeekNumber(plan, Date.now()) : null,
      },
      week: {
        ...week,
        availabilityOverride: normalizeAvailabilityOverride(week.availabilityOverride),
      },
      canGenerate: plan.status === "active" ? isWeekGeneratable(plan, week.weekNumber, Date.now()) : false,
      workouts: workouts
        .sort((left, right) => left.scheduledDateKey.localeCompare(right.scheduledDateKey))
        .map((workout) => ({
          ...workout,
          execution: executionByWorkoutId.get(String(workout._id)) ?? null,
        })),
      strengthWorkouts,
      races: races.filter((race) => {
        const raceDateKey = dateKeyFromEpochMs(race.plannedDate, plan.canonicalTimeZoneId ?? "UTC");
        return raceDateKey >= week.weekStartDateKey && raceDateKey <= week.weekEndDateKey;
      }),
    };
  },
});

export const getWorkoutView = query({
  args: {
    workoutId: v.id("workouts"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const workout = await ctx.db.get(args.workoutId);
    if (!workout) {
      throw new Error("Workout not found.");
    }

    const week = await ctx.db.get(workout.weekId);
    if (!week) {
      throw new Error("Week not found.");
    }

    const plan = await ctx.db.get(week.planId);
    if (!plan || plan.userId !== userId) {
      throw new Error("Workout not found for user.");
    }

    const execution = await ctx.db
      .query("workoutExecutions")
      .withIndex("by_planned_workout_id", (queryBuilder) => queryBuilder.eq("plannedWorkoutId", workout._id))
      .unique();
    const executionDetail = execution ? await getExecutionDetailRecord(ctx, userId, execution._id) : null;

    const rescheduleOptions: string[] = [];
    let cursor = week.weekStartDateKey as DateKey;
    while (cursor <= (week.weekEndDateKey as DateKey)) {
      if (cursor !== workout.scheduledDateKey) {
        rescheduleOptions.push(cursor);
      }
      if (cursor === week.weekEndDateKey) {
        break;
      }
      cursor = addDays(cursor, 1);
    }

    return {
      plan,
      week,
      workout,
      executionDetail,
      rescheduleOptions,
    };
  },
});

export const getHistoryView = query({
  args: {
    filter: v.optional(v.union(v.literal("all"), v.literal("matched"), v.literal("needsReview"), v.literal("unplanned"))),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const workouts = await ctx.db
      .query("healthKitWorkouts")
      .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
      .collect();
    const executions = await listExecutionSummariesByHealthKitWorkoutId(ctx, userId);
    const filter = args.filter ?? "all";

    const items = workouts
      .sort((left, right) => right.startedAt - left.startedAt)
      .map((workout) => {
        const execution = executions.get(String(workout._id)) ?? null;
        const status =
          execution?.matchStatus === "matched"
            ? "matched"
            : execution?.matchStatus === "needsReview"
              ? "needsReview"
              : "unplanned";

        return {
          ...workout,
          execution,
          status,
        };
      });

    return {
      counts: {
        matched: items.filter((item) => item.status === "matched").length,
        needsReview: items.filter((item) => item.status === "needsReview").length,
        unplanned: items.filter((item) => item.status === "unplanned").length,
      },
      items: items.filter((item) => filter === "all" || item.status === filter),
    };
  },
});

export const getHistoryWorkoutView = query({
  args: {
    healthKitWorkoutId: v.id("healthKitWorkouts"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const workout = await ctx.db.get(args.healthKitWorkoutId);
    if (!workout || workout.userId !== userId) {
      throw new Error("Imported workout not found.");
    }

    const execution = await ctx.db
      .query("workoutExecutions")
      .withIndex("by_healthkit_workout_id", (queryBuilder) => queryBuilder.eq("healthKitWorkoutId", workout._id))
      .unique();
    const executionDetail = execution ? await getExecutionDetailRecord(ctx, userId, execution._id) : null;

    return {
      workout,
      executionDetail,
    };
  },
});

export const getCoachView = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const [messages, activePlan, assessments, user] = await Promise.all([
      ctx.db
        .query("coachMessages")
        .withIndex("by_user_id_created_at", (queryBuilder) => queryBuilder.eq("userId", userId))
        .collect(),
      loadActivePlan(ctx, userId),
      ctx.db
        .query("planAssessments")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
        .collect(),
      ctx.db.get(userId),
    ]);

    const goal = await loadPlanGoal(ctx, activePlan);

    return {
      activePlan: activePlan
        ? {
            _id: activePlan._id,
            goalLabel: goal?.label ?? "Current plan",
            currentWeekNumber: activePlan.startDateKey ? deriveCurrentWeekNumber(activePlan, Date.now()) : null,
          }
        : null,
      currentVDOT: user?.currentVDOT ?? null,
      messages: messages
        .sort((left, right) => left.createdAt - right.createdAt)
        .slice(-60),
      latestAssessment: assessments.sort((left, right) => right.createdAt - left.createdAt)[0] ?? null,
    };
  },
});

export const getSettingsView = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const [user, runningSchedule, competitiveness, personality, courses, races] = await Promise.all([
      ctx.db.get(userId),
      ctx.db
        .query("runningSchedules")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
        .unique(),
      ctx.db
        .query("competitiveness")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
        .unique(),
      ctx.db
        .query("personalities")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
        .unique(),
      ctx.db
        .query("courses")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
        .collect(),
      ctx.db
        .query("races")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
        .collect(),
    ]);

    return {
      user,
      runningSchedule,
      competitiveness,
      personality,
      strengthPreference: {
        enabled: user?.strengthTrainingEnabled ?? false,
        equipment: user?.strengthEquipment ?? [],
      },
      courses: courses.sort((left, right) => left.name.localeCompare(right.name)),
      races: races.sort((left, right) => right.plannedDate - left.plannedDate),
    };
  },
});

export const exportData = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const [
      user,
      runningSchedule,
      competitiveness,
      personality,
      plans,
      goals,
      weeks,
      workouts,
      executions,
      healthKitWorkouts,
      races,
      courses,
      assessments,
    ] = await Promise.all([
      ctx.db.get(userId),
      ctx.db
        .query("runningSchedules")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
        .unique(),
      ctx.db
        .query("competitiveness")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
        .unique(),
      ctx.db
        .query("personalities")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
        .unique(),
      ctx.db
        .query("trainingPlans")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
        .collect(),
      ctx.db
        .query("goals")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
        .collect(),
      ctx.db.query("trainingWeeks").collect(),
      ctx.db.query("workouts").collect(),
      ctx.db
        .query("workoutExecutions")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
        .collect(),
      ctx.db
        .query("healthKitWorkouts")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
        .collect(),
      ctx.db
        .query("races")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
        .collect(),
      ctx.db
        .query("courses")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
        .collect(),
      ctx.db
        .query("planAssessments")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
        .collect(),
    ]);

    const planIds = new Set(plans.map((plan) => String(plan._id)));
    const weekIds = new Set(
      weeks.filter((week) => planIds.has(String(week.planId))).map((week) => String(week._id)),
    );

    return {
      exportedAt: Date.now(),
      profile: user,
      runningSchedule,
      competitiveness: competitiveness?.level ?? "balanced",
      personality: personality ?? null,
      strengthPreference: {
        enabled: user?.strengthTrainingEnabled ?? false,
        equipment: user?.strengthEquipment ?? [],
      },
      goals,
      plans,
      weeks: weeks.filter((week) => planIds.has(String(week.planId))),
      workouts: workouts.filter((workout) => weekIds.has(String(workout.weekId))),
      executions,
      healthKitWorkouts,
      races,
      courses,
      assessments,
    };
  },
});

export const saveWeekAvailabilityOverride = mutation({
  args: {
    weekId: v.id("trainingWeeks"),
    preferredRunningDays: v.optional(v.array(weekdayValidator)),
    availabilityWindows: v.optional(v.any()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const week = await ctx.db.get(args.weekId);
    if (!week) {
      throw new Error("Week not found.");
    }

    const plan = await ctx.db.get(week.planId);
    if (!plan || plan.userId !== userId) {
      throw new Error("Week not found for user.");
    }

    await ctx.db.patch(week._id, {
      availabilityOverride: {
        ...(args.preferredRunningDays ? { preferredRunningDays: args.preferredRunningDays } : {}),
        ...(args.availabilityWindows ? { availabilityWindows: args.availabilityWindows } : {}),
        ...(args.note?.trim() ? { note: args.note.trim() } : {}),
      },
      updatedAt: Date.now(),
    });

    await insertCoachEvent(ctx, userId, `Availability override saved for week ${week.weekNumber}.`, plan._id, {
      label: "Review week",
      tab: "plan",
    });
  },
});

export const clearWeekAvailabilityOverride = mutation({
  args: {
    weekId: v.id("trainingWeeks"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const week = await ctx.db.get(args.weekId);
    if (!week) {
      throw new Error("Week not found.");
    }
    const plan = await ctx.db.get(week.planId);
    if (!plan || plan.userId !== userId) {
      throw new Error("Week not found for user.");
    }

    await ctx.db.patch(week._id, {
      availabilityOverride: undefined,
      updatedAt: Date.now(),
    });
  },
});

export const updatePlanPeakVolume = mutation({
  args: {
    planId: v.id("trainingPlans"),
    peakWeekVolume: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const plan = await ctx.db.get(args.planId);
    if (!plan || plan.userId !== userId) {
      throw new Error("Plan not found.");
    }

    const normalizedPeak = Math.round(args.peakWeekVolume * 10) / 10;
    await ctx.db.patch(plan._id, {
      peakWeekVolume: normalizedPeak,
      updatedAt: Date.now(),
    });

    if (plan.status === "active") {
      await ctx.db.insert("peakVolumeChanges", {
        userId,
        planId: plan._id,
        previousPeakWeekVolume: plan.peakWeekVolume,
        newPeakWeekVolume: normalizedPeak,
        reason: args.reason.trim() || "manual update",
        createdAt: Date.now(),
      });
    }
  },
});

export const changePlanGoal = mutation({
  args: {
    planId: v.id("trainingPlans"),
    goalType: goalTypeValidator,
    goalLabel: v.string(),
    targetDate: v.optional(v.number()),
    goalTimeSeconds: v.optional(v.number()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const plan = await ctx.db.get(args.planId);
    if (!plan || plan.userId !== userId) {
      throw new Error("Plan not found.");
    }

    const previousGoalId = plan.goalId;
    const previousGoal = await ctx.db.get(previousGoalId);
    const now = Date.now();
    const nextGoalId = await ctx.db.insert("goals", {
      userId,
      type: args.goalType,
      label: args.goalLabel.trim(),
      targetDate: args.targetDate,
      goalTimeSeconds: args.goalTimeSeconds,
      createdAt: now,
    });

    await ctx.db.patch(plan._id, {
      goalId: nextGoalId,
      updatedAt: now,
    });

    await ctx.db.insert("goalChanges", {
      userId,
      planId: plan._id,
      previousGoalId,
      newGoalId: nextGoalId,
      reason: args.reason?.trim(),
      createdAt: now,
    });

    await insertCoachEvent(
      ctx,
      userId,
      `Goal updated from ${previousGoal?.label ?? "your previous target"} to ${args.goalLabel.trim()}.`,
      plan._id,
      { label: "Open coach", tab: "coach" },
    );
  },
});

export const reportPlanInterruption = mutation({
  args: {
    planId: v.id("trainingPlans"),
    type: planInterruptionTypeValidator,
    note: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const plan = await ctx.db.get(args.planId);
    if (!plan || plan.userId !== userId) {
      throw new Error("Plan not found.");
    }

    const currentWeekNumber = plan.startDateKey ? deriveCurrentWeekNumber(plan, Date.now()) : null;
    if (!currentWeekNumber) {
      throw new Error("Plan has no active week to interrupt.");
    }

    const week = await loadPlanWeek(ctx, plan._id, currentWeekNumber);
    if (!week) {
      throw new Error("Current week not found.");
    }

    await ctx.db.patch(week._id, {
      interruptionType: args.type,
      interruptionNote: args.note.trim(),
      updatedAt: Date.now(),
    });

    await insertCoachEvent(
      ctx,
      userId,
      `Marked week ${week.weekNumber} as impacted by ${args.type}. ${args.note.trim()}`,
      plan._id,
      { label: "Open coach", tab: "coach" },
    );
  },
});

export const upsertCourse = mutation({
  args: {
    courseId: v.optional(v.id("courses")),
    name: v.string(),
    distanceMeters: v.number(),
    distanceUnit: distanceUnitValidator,
    surface: surfaceTypeValidator,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const now = Date.now();

    if (args.courseId) {
      const course = await ctx.db.get(args.courseId);
      if (!course || course.userId !== userId) {
        throw new Error("Course not found.");
      }

      await ctx.db.patch(course._id, {
        name: args.name.trim(),
        distanceMeters: args.distanceMeters,
        distanceUnit: args.distanceUnit,
        surface: args.surface,
        notes: args.notes?.trim() || undefined,
        updatedAt: now,
      });
      return course._id;
    }

    return await ctx.db.insert("courses", {
      userId,
      name: args.name.trim(),
      distanceMeters: args.distanceMeters,
      distanceUnit: args.distanceUnit,
      surface: args.surface,
      notes: args.notes?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const deleteCourse = mutation({
  args: {
    courseId: v.id("courses"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const course = await ctx.db.get(args.courseId);
    if (!course || course.userId !== userId) {
      throw new Error("Course not found.");
    }
    await ctx.db.delete(course._id);
  },
});

export const upsertRace = mutation({
  args: {
    raceId: v.optional(v.id("races")),
    label: v.string(),
    plannedDate: v.number(),
    distanceMeters: v.number(),
    goalTimeSeconds: v.optional(v.number()),
    actualTimeSeconds: v.optional(v.number()),
    isPrimaryGoal: v.boolean(),
    planId: v.optional(v.id("trainingPlans")),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const now = Date.now();

    if (args.raceId) {
      const race = await ctx.db.get(args.raceId);
      if (!race || race.userId !== userId) {
        throw new Error("Race not found.");
      }

      await ctx.db.patch(race._id, {
        label: args.label.trim(),
        plannedDate: args.plannedDate,
        distanceMeters: args.distanceMeters,
        goalTimeSeconds: args.goalTimeSeconds,
        actualTimeSeconds: args.actualTimeSeconds,
        isPrimaryGoal: args.isPrimaryGoal,
        planId: args.planId,
        updatedAt: now,
      });
      return race._id;
    }

    return await ctx.db.insert("races", {
      userId,
      label: args.label.trim(),
      plannedDate: args.plannedDate,
      distanceMeters: args.distanceMeters,
      goalTimeSeconds: args.goalTimeSeconds,
      actualTimeSeconds: args.actualTimeSeconds,
      isPrimaryGoal: args.isPrimaryGoal,
      planId: args.planId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const deleteRace = mutation({
  args: {
    raceId: v.id("races"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const race = await ctx.db.get(args.raceId);
    if (!race || race.userId !== userId) {
      throw new Error("Race not found.");
    }

    if (race.isPrimaryGoal) {
      throw new Error("Primary goal race cannot be removed.");
    }

    if (race.actualTimeSeconds) {
      throw new Error("Completed races cannot be removed.");
    }

    await ctx.db.delete(race._id);
  },
});

export const toggleStrengthWorkout = mutation({
  args: {
    strengthWorkoutId: v.id("strengthWorkouts"),
    completed: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const workout = await ctx.db.get(args.strengthWorkoutId);
    if (!workout || workout.userId !== userId) {
      throw new Error("Strength workout not found.");
    }

    await ctx.db.patch(workout._id, {
      status: args.completed ? "completed" : "planned",
      updatedAt: Date.now(),
    });
  },
});
