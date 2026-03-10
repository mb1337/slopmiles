import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { addDays, type DateKey } from "../packages/domain/src/calendar";
import { getExecutionDetailRecord } from "./workoutExecutionHelpers";
import { requireAuthenticatedUserId } from "./componentReadHelpers";

export {
  bumpWorkout,
  getExecutionDetail,
  getMatchCandidates,
  linkImportedWorkout,
  reconcileImportedWorkout,
  rescheduleWorkout,
  skipWorkout,
  submitCheckIn,
  unlinkImportedWorkout,
} from "./workouts";

export const getWorkoutDetailView = query({
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
      throw new Error("Training week not found for workout.");
    }
    const plan = await ctx.db.get(week.planId);
    if (!plan || plan.userId !== userId) {
      throw new Error("Workout not found for user.");
    }
    const goal = await ctx.db.get(plan.goalId);
    const execution = await ctx.db
      .query("workoutExecutions")
      .withIndex("by_planned_workout_id", (queryBuilder) => queryBuilder.eq("plannedWorkoutId", workout._id))
      .unique();
    const executionDetail = execution ? await getExecutionDetailRecord(ctx, userId, execution._id) : null;
    const rescheduleOptions: Array<string> = [];
    let dateCursor = week.weekStartDateKey as DateKey;
    while (dateCursor <= (week.weekEndDateKey as DateKey)) {
      if (dateCursor !== workout.scheduledDateKey) {
        rescheduleOptions.push(dateCursor);
      }
      if (dateCursor === week.weekEndDateKey) {
        break;
      }
      dateCursor = addDays(dateCursor, 1);
    }

    return {
      plan: {
        _id: plan._id,
        goalLabel: goal?.label ?? "Current plan",
        volumeMode: plan.volumeMode,
        peakWeekVolume: plan.peakWeekVolume,
        weekNumber: week.weekNumber,
      },
      week: {
        _id: week._id,
        weekNumber: week.weekNumber,
        weekStartDateKey: week.weekStartDateKey,
        weekEndDateKey: week.weekEndDateKey,
      },
      workout: {
        _id: workout._id,
        type: workout.type,
        volumePercent: workout.volumePercent,
        absoluteVolume: workout.absoluteVolume,
        scheduledDateKey: workout.scheduledDateKey,
        notes: workout.notes,
        venue: workout.venue,
        origin: workout.origin,
        status: executionDetail?.execution.matchStatus === "matched" ? "completed" : workout.status,
        segments: workout.segments,
      },
      executionDetail,
      primaryAction:
        executionDetail?.execution.matchStatus === "matched"
          ? executionDetail.execution.checkInStatus === "submitted"
            ? "viewActualRun"
            : "checkIn"
          : workout.status === "skipped"
            ? "reschedule"
            : "reviewExecution",
      rescheduleOptions,
    };
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
