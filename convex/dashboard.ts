import { v } from "convex/values";

import { query } from "./_generated/server";
import { deriveCurrentWeekNumber, isWeekGeneratable } from "./planWeeks";
import { dateKeyFromEpochMs } from "../packages/domain/src/calendar";
import {
  getActivePlan,
  listPlannedWorkoutExecutionStatusesByPlanId,
  listPlanWorkoutsWithWeeks,
} from "./workoutExecutionHelpers";
import {
  getLatestCoachMessage,
  getLatestReviewWorkout,
  listPlanSummaries,
  requireAuthenticatedUserId,
} from "./componentReadHelpers";
import { loadPlanAssessmentStateMaps, resolvePlanAssessmentState } from "./planAssessmentHelpers";

export const getDashboardView = query({
  args: {
    nowBucketMs: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const [user, planSummaries, latestCoachMessage, reviewWorkout] = await Promise.all([
      ctx.db.get(userId),
      listPlanSummaries(ctx, userId),
      getLatestCoachMessage(ctx, userId),
      getLatestReviewWorkout({ ctx, userId }),
    ]);
    const assessmentMaps = await loadPlanAssessmentStateMaps(ctx, userId);

    const sortedPlans = [...planSummaries].sort((left, right) => right.createdAt - left.createdAt);
    let activePlanSummary: (typeof sortedPlans)[number] | null = null;
    const draftPlans: typeof sortedPlans = [];
    const pastPlans: typeof sortedPlans = [];

    for (const plan of sortedPlans) {
      if (!activePlanSummary && plan.status === "active") {
        activePlanSummary = plan;
        continue;
      }
      if (plan.status === "draft") {
        draftPlans.push(plan);
        continue;
      }
      if (plan.status === "completed" || plan.status === "abandoned") {
        pastPlans.push(plan);
      }
    }

    if (!activePlanSummary) {
      return {
        currentVDOT: user?.currentVDOT ?? null,
        latestCoachMessage: latestCoachMessage
          ? {
              id: String(latestCoachMessage._id),
              body: latestCoachMessage.body,
              kind: latestCoachMessage.kind,
              createdAt: latestCoachMessage.createdAt,
            }
          : null,
        activePlan: null,
        nextWorkout: null,
        weekProgress: null,
        pendingActions: [
          ...(draftPlans[0]
            ? [{
                kind: "activateDraft" as const,
                label: "Review draft",
                description: `${draftPlans[0].goal.label} draft is ready to review and activate.`,
                draftPlanId: draftPlans[0]._id,
              }]
            : []),
          {
            kind: "createPlan" as const,
            label: "Create plan",
            description: "Start a new training plan around a goal, timeline, and preferred volume mode.",
          },
          ...(reviewWorkout
            ? [{
                kind: "reviewHistory" as const,
                label: "Review unmatched run",
                description: "A recent imported run needs review before the coach can reason about it clearly.",
                healthKitWorkoutId: reviewWorkout.workout._id,
              }]
            : []),
        ],
        pastPlan: pastPlans[0]
          ? {
              _id: pastPlans[0]._id,
              status: pastPlans[0].status,
              label: pastPlans[0].goal.label,
              createdAt: pastPlans[0].createdAt,
              assessment: resolvePlanAssessmentState({
                planId: pastPlans[0]._id,
                assessmentByPlanId: assessmentMaps.assessmentByPlanId,
                requestByPlanId: assessmentMaps.requestByPlanId,
              }),
            }
          : null,
      };
    }

    const activePlan = await ctx.db.get(activePlanSummary._id);
    if (!activePlan) {
      throw new Error("Active plan could not be loaded.");
    }

    const [trainingWeeks, planEntries, executionStatusResult] = await Promise.all([
      ctx.db
        .query("trainingWeeks")
        .withIndex("by_plan_id", (queryBuilder) => queryBuilder.eq("planId", activePlan._id))
        .collect(),
      listPlanWorkoutsWithWeeks(ctx, activePlan._id),
      listPlannedWorkoutExecutionStatusesByPlanId(ctx, activePlan._id),
    ]);
    const executionStatusByPlannedWorkoutId = executionStatusResult.byPlannedWorkoutId;
    const currentWeekNumber = deriveCurrentWeekNumber(activePlan, args.nowBucketMs);
    const currentWeek =
      typeof currentWeekNumber === "number"
        ? trainingWeeks.find((week) => week.weekNumber === currentWeekNumber) ?? null
        : null;
    const todayDateKey =
      activePlan.canonicalTimeZoneId
        ? dateKeyFromEpochMs(args.nowBucketMs, activePlan.canonicalTimeZoneId)
        : null;
    const upcomingWorkouts = planEntries
      .map((entry) => ({
        workout: entry.workout,
        executionStatus: executionStatusByPlannedWorkoutId.get(String(entry.workout._id)) ?? null,
      }))
      .filter((entry) => entry.workout.status !== "skipped" && entry.executionStatus?.matchStatus !== "matched")
      .sort((left, right) => left.workout.scheduledDateKey.localeCompare(right.workout.scheduledDateKey));
    const nextWorkout =
      upcomingWorkouts.find((entry) => (todayDateKey ? entry.workout.scheduledDateKey >= todayDateKey : true)) ??
      upcomingWorkouts[0] ?? null;
    const currentWeekEntries = currentWeek ? planEntries.filter((entry) => entry.week._id === currentWeek._id) : [];
    const currentWeekCompletedCount = currentWeekEntries.filter(
      (entry) => executionStatusByPlannedWorkoutId.get(String(entry.workout._id))?.matchStatus === "matched",
    ).length;
    const pendingActions = [];
    if (currentWeek && !currentWeek.generated && isWeekGeneratable(activePlan, currentWeek.weekNumber, args.nowBucketMs)) {
      pendingActions.push({
        kind: "generateWeek" as const,
        label: `Generate week ${currentWeek.weekNumber}`,
        description: "Build this week's workouts before you need them.",
        weekNumber: currentWeek.weekNumber,
      });
    }
    if (currentWeek?.generated) {
      const workoutNeedingCheckIn = currentWeekEntries.find((entry) => {
        const executionStatus = executionStatusByPlannedWorkoutId.get(String(entry.workout._id));
        return executionStatus?.matchStatus === "matched" && executionStatus.checkInStatus !== "submitted";
      });
      if (workoutNeedingCheckIn) {
        pendingActions.push({
          kind: "submitCheckIn" as const,
          label: "Finish post-run check-in",
          description: "One completed workout still needs subjective feedback.",
          workoutId: workoutNeedingCheckIn.workout._id,
          weekNumber: currentWeek.weekNumber,
        });
      }
    }
    if (reviewWorkout) {
      pendingActions.push({
        kind: "reviewHistory" as const,
        label: "Review unmatched run",
        description: "Reconcile a recent imported run so history and coach analysis stay accurate.",
        healthKitWorkoutId: reviewWorkout.workout._id,
      });
    }
    if (draftPlans[0]) {
      pendingActions.push({
        kind: "activateDraft" as const,
        label: "Review draft",
        description: `${draftPlans[0].goal.label} draft is ready if you want to switch plans later.`,
        draftPlanId: draftPlans[0]._id,
      });
    }
    if (pendingActions.length === 0) {
      pendingActions.push({
        kind: "messageCoach" as const,
        label: "Message coach",
        description: "Ask for adjustments, tradeoffs, or a quick read on how training is going.",
      });
    }

    return {
      currentVDOT: user?.currentVDOT ?? null,
      latestCoachMessage: latestCoachMessage
        ? {
            id: String(latestCoachMessage._id),
            body: latestCoachMessage.body,
            kind: latestCoachMessage.kind,
            createdAt: latestCoachMessage.createdAt,
          }
        : null,
      activePlan: {
        _id: activePlanSummary._id,
        label: activePlanSummary.goal.label,
        numberOfWeeks: activePlanSummary.numberOfWeeks,
        volumeMode: activePlanSummary.volumeMode,
        peakWeekVolume: activePlanSummary.peakWeekVolume,
        currentWeekNumber,
      },
      nextWorkout: nextWorkout
        ? {
            _id: nextWorkout.workout._id,
            weekNumber: planEntries.find((entry) => entry.workout._id === nextWorkout.workout._id)?.week.weekNumber ?? null,
            scheduledDateKey: nextWorkout.workout.scheduledDateKey,
            type: nextWorkout.workout.type,
            absoluteVolume: nextWorkout.workout.absoluteVolume,
            volumePercent: nextWorkout.workout.volumePercent,
            venue: nextWorkout.workout.venue,
            status: nextWorkout.workout.status,
          }
        : null,
      weekProgress: currentWeek
        ? {
            weekNumber: currentWeek.weekNumber,
            totalWorkouts: currentWeekEntries.length,
            completedWorkouts: currentWeekCompletedCount,
            targetVolumeAbsolute: currentWeek.targetVolumeAbsolute,
            targetVolumePercent: currentWeek.targetVolumePercent,
            emphasis: currentWeek.emphasis,
          }
        : null,
      pendingActions,
      pastPlan: pastPlans[0]
        ? {
            _id: pastPlans[0]._id,
            status: pastPlans[0].status,
            label: pastPlans[0].goal.label,
            createdAt: pastPlans[0].createdAt,
            assessment: resolvePlanAssessmentState({
              planId: pastPlans[0]._id,
              assessmentByPlanId: assessmentMaps.assessmentByPlanId,
              requestByPlanId: assessmentMaps.requestByPlanId,
            }),
          }
        : null,
    };
  },
});
