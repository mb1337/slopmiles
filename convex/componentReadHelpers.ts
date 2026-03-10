import { getAuthUserId } from "@convex-dev/auth/server";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

export async function requireAuthenticatedUserId(ctx: QueryCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Authentication required.");
  }

  return userId;
}

export async function loadPlanGoal(
  ctx: QueryCtx,
  plan: Doc<"trainingPlans">,
): Promise<{
  _id: Id<"goals">;
  type: Doc<"goals">["type"];
  label: string;
  targetDate?: number;
  goalTimeSeconds?: number;
} | null> {
  const goal = await ctx.db.get(plan.goalId);
  if (!goal) {
    return null;
  }

  return {
    _id: goal._id,
    type: goal.type,
    label: goal.label,
    targetDate: goal.targetDate,
    goalTimeSeconds: goal.goalTimeSeconds,
  };
}

export async function listPlanSummaries(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<
  Array<{
    _id: Id<"trainingPlans">;
    status: Doc<"trainingPlans">["status"];
    startDateKey?: string;
    canonicalTimeZoneId?: string;
    activatedAt?: number;
    numberOfWeeks: number;
    volumeMode: Doc<"trainingPlans">["volumeMode"];
    peakWeekVolume: number;
    generationRationale?: string;
    createdAt: number;
    goal: NonNullable<Awaited<ReturnType<typeof loadPlanGoal>>>;
    weeklyVolumeProfile: Doc<"trainingPlans">["weeklyVolumeProfile"];
    weeklyEmphasis: Doc<"trainingPlans">["weeklyEmphasis"];
  }>
> {
  const plans = await ctx.db
    .query("trainingPlans")
    .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
    .collect();

  const summaries = await Promise.all(
    plans.map(async (plan) => {
      const goal = await loadPlanGoal(ctx, plan);
      if (!goal) {
        return null;
      }

      return {
        _id: plan._id,
        status: plan.status,
        startDateKey: plan.startDateKey,
        canonicalTimeZoneId: plan.canonicalTimeZoneId,
        activatedAt: plan.activatedAt,
        numberOfWeeks: plan.numberOfWeeks,
        volumeMode: plan.volumeMode,
        peakWeekVolume: plan.peakWeekVolume,
        generationRationale: plan.generationRationale,
        createdAt: plan.createdAt,
        goal,
        weeklyVolumeProfile: plan.weeklyVolumeProfile,
        weeklyEmphasis: plan.weeklyEmphasis,
      };
    }),
  );

  return summaries.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

export async function getLatestPlanGenerationRequest(
  ctx: QueryCtx,
  userId: Id<"users">,
) {
  const requests = await ctx.db
    .query("aiRequests")
    .withIndex("by_user_id_call_type_created_at", (queryBuilder) =>
      queryBuilder.eq("userId", userId).eq("callType", "planGeneration"),
    )
    .order("desc")
    .take(1);

  return requests[0] ?? null;
}

export async function getLatestCoachMessage(ctx: QueryCtx, userId: Id<"users">) {
  const messages = await ctx.db
    .query("coachMessages")
    .withIndex("by_user_id_author_created_at", (queryBuilder) =>
      queryBuilder.eq("userId", userId).eq("author", "coach"),
    )
    .order("desc")
    .take(1);

  return messages[0] ?? null;
}

async function getLatestWorkoutByHistoryStatus(args: {
  ctx: QueryCtx;
  userId: Id<"users">;
  historyStatus: "needsReview" | "unplanned";
}) {
  const workouts = await args.ctx.db
    .query("healthKitWorkouts")
    .withIndex("by_user_id_history_status_started_at", (queryBuilder) =>
      queryBuilder.eq("userId", args.userId).eq("historyStatus", args.historyStatus),
    )
    .order("desc")
    .take(1);

  return workouts[0] ?? null;
}

export async function getLatestReviewWorkout(args: {
  ctx: QueryCtx;
  userId: Id<"users">;
}) {
  const [needsReviewWorkout, unplannedWorkout] = await Promise.all([
    getLatestWorkoutByHistoryStatus({ ...args, historyStatus: "needsReview" }),
    getLatestWorkoutByHistoryStatus({ ...args, historyStatus: "unplanned" }),
  ]);

  const workout =
    !needsReviewWorkout ? unplannedWorkout
    : !unplannedWorkout ? needsReviewWorkout
    : needsReviewWorkout.startedAt >= unplannedWorkout.startedAt ? needsReviewWorkout : unplannedWorkout;

  if (!workout) {
    return null;
  }

  const execution = await args.ctx.db
    .query("workoutExecutions")
    .withIndex("by_healthkit_workout_id", (queryBuilder) =>
      queryBuilder.eq("healthKitWorkoutId", workout._id),
    )
    .unique();

  return {
    workout,
    execution,
  };
}

export async function hasDraftPlan(ctx: QueryCtx, userId: Id<"users">) {
  const drafts = await ctx.db
    .query("trainingPlans")
    .withIndex("by_user_id_status", (queryBuilder) =>
      queryBuilder.eq("userId", userId).eq("status", "draft"),
    )
    .take(1);

  return drafts.length > 0;
}

export function buildCoachPrompts(args: {
  hasActivePlan: boolean;
  hasDraftPlan: boolean;
  hasCurrentWeek: boolean;
  hasUnmatchedRun: boolean;
}) {
  if (!args.hasActivePlan) {
    const prompts = [
      "Help me choose between a 5K and 10K goal.",
      "What peak volume should I target for a safe build?",
      "Pressure-test my schedule before I create a draft.",
    ];
    if (args.hasDraftPlan) {
      prompts.unshift("Compare my drafts and tell me which one is more realistic.");
    }
    return prompts;
  }

  const prompts = [
    "I need to skip today's run. What should I protect this week?",
    "Help me move my long run without wrecking recovery.",
    "Is my current goal still realistic based on the last two weeks?",
  ];

  if (args.hasCurrentWeek) {
    prompts.unshift("Summarize the priority for this week in plain English.");
  }

  if (args.hasUnmatchedRun) {
    prompts.push("I logged an extra run. How should it change the rest of my week?");
  }

  return prompts;
}
