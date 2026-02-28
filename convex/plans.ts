import { v } from "convex/values";

import { goalTypes, planStatuses, volumeModes } from "./constants";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

const goalTypeValidator = v.union(...goalTypes.map((goalType) => v.literal(goalType)));
const volumeModeValidator = v.union(...volumeModes.map((mode) => v.literal(mode)));
const planStatusValidator = v.union(...planStatuses.map((status) => v.literal(status)));

type PlanSummary = {
  _id: Id<"trainingPlans">;
  status: (typeof planStatuses)[number];
  numberOfWeeks: number;
  volumeMode: (typeof volumeModes)[number];
  peakWeekVolume: number;
  createdAt: number;
  goal: {
    _id: Id<"goals">;
    type: (typeof goalTypes)[number];
    label: string;
    targetDate?: number;
    goalTimeSeconds?: number;
  };
};

async function listPlanSummaries(ctx: QueryCtx, userId: Id<"users">): Promise<PlanSummary[]> {
  const plans = await ctx.db
    .query("trainingPlans")
    .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
    .collect();

  const summaries: PlanSummary[] = [];

  for (const plan of plans) {
    const goal = await ctx.db.get(plan.goalId);
    if (!goal) {
      continue;
    }

    summaries.push({
      _id: plan._id,
      status: plan.status,
      numberOfWeeks: plan.numberOfWeeks,
      volumeMode: plan.volumeMode,
      peakWeekVolume: plan.peakWeekVolume,
      createdAt: plan.createdAt,
      goal: {
        _id: goal._id,
        type: goal.type,
        label: goal.label,
        targetDate: goal.targetDate,
        goalTimeSeconds: goal.goalTimeSeconds,
      },
    });
  }

  return summaries;
}

export const getPlanState = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const planSummaries = await listPlanSummaries(ctx, args.userId);
    const sorted = [...planSummaries].sort((a, b) => b.createdAt - a.createdAt);

    const activePlan = sorted.find((plan) => plan.status === "active") ?? null;
    const draftPlans = sorted.filter((plan) => plan.status === "draft");
    const pastPlans = sorted.filter((plan) => plan.status === "completed" || plan.status === "abandoned");

    return {
      activePlan,
      draftPlans,
      pastPlans,
    };
  },
});

export const createPlan = mutation({
  args: {
    userId: v.id("users"),
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

    const activePlans = await ctx.db
      .query("trainingPlans")
      .withIndex("by_user_id_status", (queryBuilder) =>
        queryBuilder.eq("userId", args.userId).eq("status", "active"),
      )
      .collect();

    const now = Date.now();
    const goalId = await ctx.db.insert("goals", {
      userId: args.userId,
      type: args.goalType,
      label: normalizedGoalLabel,
      targetDate: args.targetDate,
      goalTimeSeconds: args.goalTimeSeconds,
      createdAt: now,
    });

    const status = activePlans.length > 0 ? "draft" : "active";

    const planId = await ctx.db.insert("trainingPlans", {
      userId: args.userId,
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
    userId: v.id("users"),
    planId: v.id("trainingPlans"),
  },
  handler: async (ctx, args) => {
    const targetPlan = await ctx.db.get(args.planId);
    if (!targetPlan || targetPlan.userId !== args.userId) {
      throw new Error("Plan not found for user.");
    }

    if (targetPlan.status !== "draft") {
      throw new Error("Only draft plans can be activated.");
    }

    const activePlans = await ctx.db
      .query("trainingPlans")
      .withIndex("by_user_id_status", (queryBuilder) =>
        queryBuilder.eq("userId", args.userId).eq("status", "active"),
      )
      .collect();

    if (activePlans.length > 0) {
      throw new Error("One active plan is allowed. Complete or abandon the current active plan first.");
    }

    await ctx.db.patch(targetPlan._id, {
      status: "active",
      updatedAt: Date.now(),
    });

    return {
      activatedPlanId: targetPlan._id,
    };
  },
});

export const updatePlanStatus = mutation({
  args: {
    userId: v.id("users"),
    planId: v.id("trainingPlans"),
    status: planStatusValidator,
  },
  handler: async (ctx, args) => {
    const plan = await ctx.db.get(args.planId);
    if (!plan || plan.userId !== args.userId) {
      throw new Error("Plan not found for user.");
    }

    if (args.status === "active") {
      throw new Error("Use activateDraftPlan to activate a draft.");
    }

    await ctx.db.patch(plan._id, {
      status: args.status,
      updatedAt: Date.now(),
    });

    return {
      updatedPlanId: plan._id,
      status: args.status,
    };
  },
});
