import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { addDays, type DateKey } from "../packages/domain/src/calendar";
import { aiCallTypes, goalTypes, planStatuses, volumeModes } from "./constants";
import { deriveCurrentWeekNumber, endDateFromStart, isWeekGeneratable, normalizeActivationDateKey, resolveAbsoluteWeekVolume } from "./planWeeks";
import { listExecutionSummariesByPlannedWorkoutId } from "./workoutExecutionHelpers";

const goalTypeValidator = v.union(...goalTypes.map((goalType) => v.literal(goalType)));
const volumeModeValidator = v.union(...volumeModes.map((mode) => v.literal(mode)));
const planStatusValidator = v.union(...planStatuses.map((status) => v.literal(status)));

const WEEK_DETAIL_PROMPT_REVISION = "week-detail-v1";
const WEEK_DETAIL_SCHEMA_REVISION = "week-detail-v1";

async function requireAuthenticatedQueryUserId(ctx: QueryCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Authentication required.");
  }
  return userId;
}

async function requireAuthenticatedMutationUserId(ctx: MutationCtx): Promise<Id<"users">> {
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
) {
  await ctx.db.insert("coachMessages", {
    userId,
    author: "coach",
    kind: "event",
    body,
    planId,
    createdAt: Date.now(),
  });
}

function weekPercentMap(plan: Pick<Doc<"trainingPlans">, "weeklyVolumeProfile">): Map<number, number> {
  return new Map((plan.weeklyVolumeProfile ?? []).map((entry) => [entry.weekNumber, entry.percentOfPeak]));
}

function weekEmphasisMap(plan: Pick<Doc<"trainingPlans">, "weeklyEmphasis">): Map<number, string> {
  return new Map((plan.weeklyEmphasis ?? []).map((entry) => [entry.weekNumber, entry.emphasis]));
}

async function seedTrainingWeeks(ctx: MutationCtx, plan: Doc<"trainingPlans">): Promise<void> {
  if (!plan.startDateKey) {
    throw new Error("Plan startDateKey is required before seeding weeks.");
  }

  const percentByWeek = weekPercentMap(plan);
  const emphasisByWeek = weekEmphasisMap(plan);
  const existingWeeks = await ctx.db
    .query("trainingWeeks")
    .withIndex("by_plan_id", (queryBuilder) => queryBuilder.eq("planId", plan._id))
    .collect();
  const weekByNumber = new Map(existingWeeks.map((week) => [week.weekNumber, week]));
  const now = Date.now();

  for (let weekNumber = 1; weekNumber <= plan.numberOfWeeks; weekNumber += 1) {
    const weekStartDateKey = addDays(plan.startDateKey as DateKey, (weekNumber - 1) * 7);
    const targetVolumePercent = percentByWeek.get(weekNumber) ?? 0;
    const emphasis = emphasisByWeek.get(weekNumber) ?? "";
    const payload = {
      planId: plan._id,
      weekNumber,
      weekStartDateKey,
      weekEndDateKey: endDateFromStart(weekStartDateKey),
      targetVolumePercent,
      targetVolumeAbsolute: resolveAbsoluteWeekVolume(plan.volumeMode, plan.peakWeekVolume, targetVolumePercent),
      emphasis,
      generated: false,
      updatedAt: now,
    };

    const existingWeek = weekByNumber.get(weekNumber);
    if (existingWeek) {
      await ctx.db.patch(existingWeek._id, payload);
    } else {
      await ctx.db.insert("trainingWeeks", {
        ...payload,
        createdAt: now,
      });
    }
  }
}

async function enqueueWeekDetailGeneration(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    planId: Id<"trainingPlans">;
    weekNumber: number;
  },
): Promise<Id<"aiRequests">> {
  const now = Date.now();
  const dedupeKey = [
    "weekDetailGeneration",
    args.planId,
    args.weekNumber,
    WEEK_DETAIL_PROMPT_REVISION,
    WEEK_DETAIL_SCHEMA_REVISION,
  ].join("|");

  const existing = await ctx.db
    .query("aiRequests")
    .withIndex("by_user_id_call_type_dedupe_key", (queryBuilder) =>
      queryBuilder.eq("userId", args.userId).eq("callType", "weekDetailGeneration").eq("dedupeKey", dedupeKey),
    )
    .collect();

  const inFlight = existing.find((request) => request.status === "queued" || request.status === "inProgress");
  if (inFlight) {
    return inFlight._id;
  }

  const requestId = await ctx.db.insert("aiRequests", {
    userId: args.userId,
    callType: aiCallTypes[1],
    status: "queued",
    priority: "userBlocking",
    dedupeKey,
    input: {
      planId: args.planId,
      weekNumber: args.weekNumber,
    },
    attemptCount: 0,
    maxAttempts: 1,
    promptRevision: WEEK_DETAIL_PROMPT_REVISION,
    schemaRevision: WEEK_DETAIL_SCHEMA_REVISION,
    createdAt: now,
    updatedAt: now,
  });

  await ctx.scheduler.runAfter(0, internal.coach.processWeekDetailGenerationRequest, {
    requestId,
  });

  return requestId;
}

export const getWeekDetail = query({
  args: {
    planId: v.id("trainingPlans"),
    weekNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedQueryUserId(ctx);
    const plan = await ctx.db.get(args.planId);
    if (!plan || plan.userId !== userId) {
      throw new Error("Plan not found for user.");
    }

    const week = await ctx.db
      .query("trainingWeeks")
      .withIndex("by_plan_id_week_number", (queryBuilder) =>
        queryBuilder.eq("planId", plan._id).eq("weekNumber", Math.round(args.weekNumber)),
      )
      .unique();

    if (!week) {
      throw new Error("Training week not found.");
    }

    const workouts = await ctx.db
      .query("workouts")
      .withIndex("by_week_id", (queryBuilder) => queryBuilder.eq("weekId", week._id))
      .collect();
    const executionSummaryByPlannedWorkoutId = await listExecutionSummariesByPlannedWorkoutId(ctx, userId);

    const requests = await ctx.db
      .query("aiRequests")
      .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
      .collect();

    const latestRequest = requests
      .filter((request) => {
        if (request.callType !== "weekDetailGeneration") {
          return false;
        }
        const input = request.input as { planId?: Id<"trainingPlans">; weekNumber?: number } | undefined;
        return input?.planId === plan._id && input?.weekNumber === week.weekNumber;
      })
      .sort((left, right) => right.createdAt - left.createdAt)[0];

    return {
      plan: {
        _id: plan._id,
        numberOfWeeks: plan.numberOfWeeks,
        volumeMode: plan.volumeMode,
        peakWeekVolume: plan.peakWeekVolume,
        startDateKey: plan.startDateKey,
        canonicalTimeZoneId: plan.canonicalTimeZoneId,
      },
      week: {
        _id: week._id,
        weekNumber: week.weekNumber,
        weekStartDateKey: week.weekStartDateKey,
        weekEndDateKey: week.weekEndDateKey,
        targetVolumePercent: week.targetVolumePercent,
        targetVolumeAbsolute: week.targetVolumeAbsolute,
        emphasis: week.emphasis,
        coachNotes: week.coachNotes,
        generated: week.generated,
      },
      workouts: workouts
        .sort((left, right) => left.scheduledDateKey.localeCompare(right.scheduledDateKey))
        .map((workout) => ({
          _id: workout._id,
          weekId: workout.weekId,
          type: workout.type,
          volumePercent: workout.volumePercent,
          absoluteVolume: workout.absoluteVolume,
          scheduledDateKey: workout.scheduledDateKey,
          notes: workout.notes,
          venue: workout.venue,
          origin: workout.origin,
          status:
            executionSummaryByPlannedWorkoutId.get(String(workout._id))?.matchStatus === "matched"
              ? "completed"
              : workout.status,
          segments: workout.segments,
          execution: executionSummaryByPlannedWorkoutId.get(String(workout._id)) ?? null,
        })),
      latestRequest: latestRequest
        ? {
            _id: latestRequest._id,
            status: latestRequest.status,
            errorMessage: latestRequest.errorMessage,
            createdAt: latestRequest.createdAt,
            updatedAt: latestRequest.updatedAt,
          }
        : null,
      currentWeekNumber: deriveCurrentWeekNumber(plan, Date.now()),
      canGenerate: isWeekGeneratable(plan, week.weekNumber, Date.now()),
    };
  },
});

export const createPlan = mutation({
  args: {
    goalType: goalTypeValidator,
    goalLabel: v.string(),
    targetDate: v.optional(v.number()),
    goalTimeSeconds: v.optional(v.number()),
    numberOfWeeks: v.number(),
    volumeMode: volumeModeValidator,
    peakWeekVolume: v.number(),
  },
  handler: async (ctx, args) => {
    const normalizedGoalLabel = args.goalLabel.trim();
    if (normalizedGoalLabel.length === 0) {
      throw new Error("Goal label cannot be empty.");
    }

    const userId = await requireAuthenticatedMutationUserId(ctx);

    const activePlans = await ctx.db
      .query("trainingPlans")
      .withIndex("by_user_id_status", (queryBuilder) =>
        queryBuilder.eq("userId", userId).eq("status", "active"),
      )
      .collect();

    const now = Date.now();
    const goalId = await ctx.db.insert("goals", {
      userId,
      type: args.goalType,
      label: normalizedGoalLabel,
      targetDate: args.targetDate,
      goalTimeSeconds: args.goalTimeSeconds,
      createdAt: now,
    });

    const status = activePlans.length > 0 ? "draft" : "active";

    const planId = await ctx.db.insert("trainingPlans", {
      userId,
      goalId,
      numberOfWeeks: args.numberOfWeeks,
      volumeMode: args.volumeMode,
      peakWeekVolume: args.peakWeekVolume,
      status,
      createdAt: now,
      updatedAt: now,
    });

    const plan = await ctx.db.get(planId);

    return {
      plan,
      status,
      createdAsDraft: status === "draft",
      activePlanId: activePlans[0]?._id ?? null,
    };
  },
});

export const activateDraftPlan = mutation({
  args: {
    planId: v.id("trainingPlans"),
    canonicalTimeZoneId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedMutationUserId(ctx);
    const targetPlan = await ctx.db.get(args.planId);
    if (!targetPlan || targetPlan.userId !== userId) {
      throw new Error("Plan not found for user.");
    }

    if (targetPlan.status !== "draft") {
      throw new Error("Only draft plans can be activated.");
    }

    const activePlans = await ctx.db
      .query("trainingPlans")
      .withIndex("by_user_id_status", (queryBuilder) =>
        queryBuilder.eq("userId", userId).eq("status", "active"),
      )
      .collect();

    if (activePlans.length > 0) {
      throw new Error("One active plan is allowed. Complete or abandon the current active plan first.");
    }

    const now = Date.now();
    const startDateKey = normalizeActivationDateKey(now, args.canonicalTimeZoneId);
    await ctx.db.patch(targetPlan._id, {
      status: "active",
      startDateKey,
      canonicalTimeZoneId: args.canonicalTimeZoneId,
      activatedAt: now,
      updatedAt: now,
    });

    const activatedPlan = await ctx.db.get(targetPlan._id);
    if (!activatedPlan) {
      throw new Error("Activated plan could not be reloaded.");
    }

    await seedTrainingWeeks(ctx, activatedPlan);
    const currentWeekNumber = deriveCurrentWeekNumber(activatedPlan, now);
    if (currentWeekNumber) {
      await enqueueWeekDetailGeneration(ctx, {
        userId,
        planId: activatedPlan._id,
        weekNumber: currentWeekNumber,
      });
    }

    const goal = await ctx.db.get(targetPlan.goalId);
    await insertCoachEvent(
      ctx,
      userId,
      `Draft activated${goal ? ` for ${goal.label}` : ""}. I'll treat this as the live training focus now.`,
      targetPlan._id,
    );

    return {
      activatedPlanId: targetPlan._id,
      currentWeekNumber,
    };
  },
});

export const updateDraftPlanBasics = mutation({
  args: {
    planId: v.id("trainingPlans"),
    peakWeekVolume: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedMutationUserId(ctx);
    const plan = await ctx.db.get(args.planId);
    if (!plan || plan.userId !== userId) {
      throw new Error("Plan not found for user.");
    }

    if (plan.status !== "draft") {
      throw new Error("Only draft plans can be edited.");
    }

    const peakWeekVolume = Math.round(args.peakWeekVolume * 10) / 10;
    if (!Number.isFinite(peakWeekVolume) || peakWeekVolume <= 0) {
      throw new Error("Peak week volume must be a positive number.");
    }

    await ctx.db.patch(plan._id, {
      peakWeekVolume,
      updatedAt: Date.now(),
    });

    await insertCoachEvent(
      ctx,
      userId,
      `Draft peak week volume updated to ${peakWeekVolume} ${plan.volumeMode === "time" ? "minutes" : "meters"}.`,
      plan._id,
    );

    return {
      updatedPlanId: plan._id,
      peakWeekVolume,
    };
  },
});

export const updatePlanStatus = mutation({
  args: {
    planId: v.id("trainingPlans"),
    status: planStatusValidator,
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedMutationUserId(ctx);
    const plan = await ctx.db.get(args.planId);
    if (!plan || plan.userId !== userId) {
      throw new Error("Plan not found for user.");
    }

    if (args.status === "active") {
      throw new Error("Use activateDraftPlan to activate a draft.");
    }

    await ctx.db.patch(plan._id, {
      status: args.status,
      updatedAt: Date.now(),
    });

    const goal = await ctx.db.get(plan.goalId);
    if (args.status === "completed") {
      await ctx.runMutation(internal.coach.enqueuePlanAssessmentRequest, {
        planId: plan._id,
      });
      await insertCoachEvent(
        ctx,
        userId,
        `Plan marked complete${goal ? ` for ${goal.label}` : ""}. Time to review the block and decide what comes next.`,
        plan._id,
      );
    }

    if (args.status === "abandoned") {
      await ctx.runMutation(internal.coach.enqueuePlanAssessmentRequest, {
        planId: plan._id,
      });
      await insertCoachEvent(
        ctx,
        userId,
        `Plan closed${goal ? ` for ${goal.label}` : ""}. You can activate another draft whenever you're ready.`,
        plan._id,
      );
    }

    return {
      updatedPlanId: plan._id,
      status: args.status,
    };
  },
});
