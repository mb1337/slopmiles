import { v } from "convex/values";

import { query } from "./_generated/server";
import { deriveCurrentWeekNumber } from "./planWeeks";
import { getActivePlan } from "./workoutExecutionHelpers";
import {
  buildCoachPrompts,
  getLatestReviewWorkout,
  listPlanSummaries,
  hasDraftPlan,
  requireAuthenticatedUserId,
} from "./componentReadHelpers";
import { loadPlanAssessmentStateMaps, resolvePlanAssessmentState } from "./planAssessmentHelpers";

export const getCoachInboxView = query({
  args: {
    nowBucketMs: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const [user, runningSchedule, competitiveness, personality, messages, activePlan, reviewWorkout, draftPlanExists, planSummaries] = await Promise.all([
      ctx.db.get(userId),
      ctx.db.query("runningSchedules").withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId)).unique(),
      ctx.db.query("competitiveness").withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId)).unique(),
      ctx.db.query("personalities").withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId)).unique(),
      ctx.db.query("coachMessages").withIndex("by_user_id_created_at", (queryBuilder) => queryBuilder.eq("userId", userId)).order("desc").take(40),
      getActivePlan(ctx, userId),
      getLatestReviewWorkout({ ctx, userId }),
      hasDraftPlan(ctx, userId),
      listPlanSummaries(ctx, userId),
    ]);
    const activePlanGoal = activePlan ? await ctx.db.get(activePlan.goalId) : null;
    const currentWeekNumber = activePlan ? deriveCurrentWeekNumber(activePlan, args.nowBucketMs) : null;
    const hasUnmatchedRun = reviewWorkout !== null;
    const assessmentMaps = await loadPlanAssessmentStateMaps(ctx, userId);
    const latestPastPlan = [...planSummaries]
      .filter((plan) => plan.status === "completed" || plan.status === "abandoned")
      .sort((left, right) => right.createdAt - left.createdAt)[0] ?? null;

    return {
      currentVDOT: user?.currentVDOT ?? null,
      competitiveness: competitiveness?.level ?? "balanced",
      personality: {
        name: personality?.name ?? "noNonsense",
        description: personality?.description ?? "Brief, direct, no fluff.",
      },
      runningSchedule: runningSchedule
        ? {
            preferredRunningDays: runningSchedule.preferredRunningDays,
            runningDaysPerWeek: runningSchedule.runningDaysPerWeek,
            preferredLongRunDay: runningSchedule.preferredLongRunDay ?? null,
          }
        : null,
      activePlan: activePlan
        ? {
            _id: activePlan._id,
            goalLabel: activePlanGoal?.label ?? "Current plan",
            numberOfWeeks: activePlan.numberOfWeeks,
            volumeMode: activePlan.volumeMode,
            peakWeekVolume: activePlan.peakWeekVolume,
            currentWeekNumber,
          }
        : null,
      latestAssessment: latestPastPlan
        ? {
            planId: String(latestPastPlan._id),
            planLabel: latestPastPlan.goal.label,
            planStatus: latestPastPlan.status,
            state: resolvePlanAssessmentState({
              planId: latestPastPlan._id,
              assessmentByPlanId: assessmentMaps.assessmentByPlanId,
              requestByPlanId: assessmentMaps.requestByPlanId,
            }),
          }
        : null,
      suggestedPrompts: buildCoachPrompts({
        hasActivePlan: Boolean(activePlan),
        hasDraftPlan: draftPlanExists,
        hasCurrentWeek: typeof currentWeekNumber === "number",
        hasUnmatchedRun,
      }),
      messages: [...messages].reverse().map((message) => ({
        _id: String(message._id),
        author: message.author,
        kind: message.kind,
        body: message.body,
        createdAt: message.createdAt,
        cta:
          message.kind === "event" && activePlan
            ? {
                label: "Open plan",
                tab: "plan" as const,
              }
            : hasUnmatchedRun
              ? {
                  label: "Review history",
                  tab: "history" as const,
                }
              : null,
      })),
    };
  },
});
