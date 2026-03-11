import { v } from "convex/values";

import { query } from "./_generated/server";
import { loadPlanGoal, requireAuthenticatedUserId } from "./componentReadHelpers";
import { loadPlanAssessmentStateMaps, resolvePlanAssessmentState } from "./planAssessmentHelpers";

export const getPastPlanDetailView = query({
  args: {
    planId: v.id("trainingPlans"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const plan = await ctx.db.get(args.planId);
    if (!plan || plan.userId !== userId) {
      throw new Error("Plan not found.");
    }
    if (plan.status !== "completed" && plan.status !== "abandoned") {
      throw new Error("Only completed or abandoned plans are available in history.");
    }

    const [goal, weeks, assessmentMaps] = await Promise.all([
      loadPlanGoal(ctx, plan),
      ctx.db
        .query("trainingWeeks")
        .withIndex("by_plan_id", (queryBuilder) => queryBuilder.eq("planId", plan._id))
        .collect(),
      loadPlanAssessmentStateMaps(ctx, userId),
    ]);
    if (!goal) {
      throw new Error("Plan goal not found.");
    }

    return {
      plan: {
        _id: plan._id,
        status: plan.status,
        goalLabel: goal.label,
        goalType: goal.type,
        targetDate: goal.targetDate ?? null,
        goalTimeSeconds: goal.goalTimeSeconds ?? null,
        numberOfWeeks: plan.numberOfWeeks,
        volumeMode: plan.volumeMode,
        peakWeekVolume: plan.peakWeekVolume,
        createdAt: plan.createdAt,
      },
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
      assessment: resolvePlanAssessmentState({
        planId: plan._id,
        assessmentByPlanId: assessmentMaps.assessmentByPlanId,
        requestByPlanId: assessmentMaps.requestByPlanId,
      }),
    };
  },
});
