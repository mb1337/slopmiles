import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { deriveCurrentWeekNumber } from "./planWeeks";
import { goalTypes, planInterruptionTypes } from "./constants";
export { deleteRace, upsertRace } from "./settings";

type PlanProposal = {
  numberOfWeeks: number;
  peakWeekVolume: number;
  weeklyVolumeProfile: Array<{
    weekNumber: number;
    percentOfPeak: number;
  }>;
  weeklyEmphasis: Array<{
    weekNumber: number;
    emphasis: string;
  }>;
  rationale: string;
  metadata?: {
    model?: string;
  };
  corrections?: string[];
};

const goalTypeValidator = v.union(...goalTypes.map((goalType) => v.literal(goalType)));
const planInterruptionTypeValidator = v.union(...planInterruptionTypes.map((item) => v.literal(item)));

async function requireAuthenticatedUserId(ctx: QueryCtx): Promise<Id<"users">> {
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

function parsePlanProposal(value: unknown): PlanProposal | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as {
    numberOfWeeks?: unknown;
    peakWeekVolume?: unknown;
    weeklyVolumeProfile?: unknown;
    weeklyEmphasis?: unknown;
    rationale?: unknown;
    metadata?: {
      model?: unknown;
    };
    corrections?: unknown;
  };

  if (
    typeof candidate.numberOfWeeks !== "number" ||
    typeof candidate.peakWeekVolume !== "number" ||
    !Array.isArray(candidate.weeklyVolumeProfile) ||
    !Array.isArray(candidate.weeklyEmphasis) ||
    typeof candidate.rationale !== "string"
  ) {
    return null;
  }

  return {
    numberOfWeeks: candidate.numberOfWeeks,
    peakWeekVolume: candidate.peakWeekVolume,
    weeklyVolumeProfile: candidate.weeklyVolumeProfile as PlanProposal["weeklyVolumeProfile"],
    weeklyEmphasis: candidate.weeklyEmphasis as PlanProposal["weeklyEmphasis"],
    rationale: candidate.rationale,
    ...(typeof candidate.metadata?.model === "string" ? { metadata: { model: candidate.metadata.model } } : {}),
    ...(Array.isArray(candidate.corrections)
      ? {
          corrections: candidate.corrections.filter((entry): entry is string => typeof entry === "string"),
        }
      : {}),
  };
}

async function loadGoal(
  ctx: QueryCtx,
  goalId: Id<"goals">,
): Promise<Doc<"goals"> | null> {
  return await ctx.db.get(goalId);
}

async function getLatestPlanGenerationRequest(ctx: QueryCtx, userId: Id<"users">) {
  const requests = await ctx.db
    .query("aiRequests")
    .withIndex("by_user_id_call_type_created_at", (queryBuilder) =>
      queryBuilder.eq("userId", userId).eq("callType", "planGeneration"),
    )
    .order("desc")
    .take(1);

  return requests[0] ?? null;
}

export const getPlanOverviewView = query({
  args: {
    nowBucketMs: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const [plans, latestRequest] = await Promise.all([
      ctx.db
        .query("trainingPlans")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
        .collect(),
      getLatestPlanGenerationRequest(ctx, userId),
    ]);

    const sortedPlans = [...plans].sort((left, right) => right.createdAt - left.createdAt);
    const activePlanDoc = sortedPlans.find((plan) => plan.status === "active") ?? null;
    const draftPlanDocs = sortedPlans.filter((plan) => plan.status === "draft");
    const pastPlanDocs = sortedPlans.filter((plan) => plan.status === "completed" || plan.status === "abandoned");
    const targetPlan = activePlanDoc ?? draftPlanDocs[0] ?? null;

    const activeGoal = targetPlan ? await loadGoal(ctx, targetPlan.goalId) : null;
    const activeWeeks =
      targetPlan
        ? await ctx.db
            .query("trainingWeeks")
            .withIndex("by_plan_id", (queryBuilder) => queryBuilder.eq("planId", targetPlan._id))
            .collect()
        : [];
    const [peakVolumeChanges, goalChanges, races] =
      targetPlan
        ? await Promise.all([
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
        : [[], [], []];

    const draftGoals = await Promise.all(
      draftPlanDocs.map(async (plan) => ({
        plan,
        goal: await loadGoal(ctx, plan.goalId),
      })),
    );
    const pastGoals = await Promise.all(
      pastPlanDocs.map(async (plan) => ({
        plan,
        goal: await loadGoal(ctx, plan.goalId),
      })),
    );

    const mappedWeeks = activeWeeks
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
      }));
    const currentWeekNumber =
      targetPlan?.startDateKey ? deriveCurrentWeekNumber(targetPlan, args.nowBucketMs) : null;
    const parsedProposal = latestRequest ? parsePlanProposal(latestRequest.result) : null;
    const latestProposal = latestRequest
      ? {
          _id: latestRequest._id,
          status: latestRequest.status,
          errorMessage: latestRequest.errorMessage,
          consumedByPlanId: latestRequest.consumedByPlanId ?? null,
          createdAt: latestRequest.createdAt,
          input: latestRequest.input,
          result: parsedProposal,
        }
      : null;

    return {
      activePlan: targetPlan
        ? {
            ...targetPlan,
            goal: activeGoal
              ? {
                  _id: activeGoal._id,
                  type: activeGoal.type,
                  label: activeGoal.label,
                  targetDate: activeGoal.targetDate,
                  goalTimeSeconds: activeGoal.goalTimeSeconds,
                }
              : null,
            goalLabel: activeGoal?.label ?? "Current plan",
            goalType: activeGoal?.type ?? "race",
            targetDate: activeGoal?.targetDate ?? null,
            goalTimeSeconds: activeGoal?.goalTimeSeconds ?? null,
            currentWeekNumber,
            nextWeekNumber:
              currentWeekNumber && currentWeekNumber < targetPlan.numberOfWeeks ? currentWeekNumber + 1 : null,
            weeks: mappedWeeks,
            trainingWeeks: mappedWeeks,
            peakVolumeChanges,
            goalChanges,
            races: races.sort((left, right) => left.plannedDate - right.plannedDate),
          }
        : null,
      draftPlans: draftGoals.map(({ plan, goal }) => ({
        ...plan,
        goal: goal
          ? {
              _id: goal._id,
              type: goal.type,
              label: goal.label,
              targetDate: goal.targetDate,
              goalTimeSeconds: goal.goalTimeSeconds,
            }
          : null,
        goalLabel: goal?.label ?? "Draft plan",
      })),
      pastPlans: pastGoals.map(({ plan, goal }) => ({
        ...plan,
        goal: goal
          ? {
              _id: goal._id,
              type: goal.type,
              label: goal.label,
              targetDate: goal.targetDate,
              goalTimeSeconds: goal.goalTimeSeconds,
            }
          : null,
        goalLabel: goal?.label ?? "Past plan",
      })),
      latestProposal,
      proposal: latestProposal,
    };
  },
});

export const updatePlanPeakVolume = mutation({
  args: {
    planId: v.id("trainingPlans"),
    peakWeekVolume: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedMutationUserId(ctx);
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
    const userId = await requireAuthenticatedMutationUserId(ctx);
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
    const userId = await requireAuthenticatedMutationUserId(ctx);
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
