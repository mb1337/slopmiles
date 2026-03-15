import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { effortModifiers } from "./constants";
import {
  getExecutionDetailRecord,
  getMatchCandidateRecords,
  linkExecutionToPlannedWorkout,
  reconcileImportedWorkoutExecution,
  regenerateFeedbackForExecution,
  unlinkExecution,
} from "./workoutExecutionHelpers";
import { addDays, type DateKey } from "../packages/domain/src/calendar";

const effortModifierValidator = v.union(...effortModifiers.map((modifier) => v.literal(modifier)));

async function requireAuthenticatedUserId(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Authentication required.");
  }

  return userId;
}

export const getExecutionDetail = query({
  args: {
    executionId: v.id("workoutExecutions"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const detail = await getExecutionDetailRecord(ctx, userId, args.executionId);
    if (!detail) {
      throw new Error("Workout execution not found for user.");
    }

    return detail;
  },
});

export const getMatchCandidates = query({
  args: {
    healthKitWorkoutId: v.id("healthKitWorkouts"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const execution = await ctx.db
      .query("workoutExecutions")
      .withIndex("by_healthkit_workout_id", (queryBuilder) =>
        queryBuilder.eq("healthKitWorkoutId", args.healthKitWorkoutId),
      )
      .unique();

    return getMatchCandidateRecords(ctx, {
      userId,
      healthKitWorkoutId: args.healthKitWorkoutId,
      excludeExecutionId: execution?._id,
    });
  },
});

export const submitCheckIn = mutation({
  args: {
    executionId: v.id("workoutExecutions"),
    rpe: v.optional(v.number()),
    modifiers: v.array(effortModifierValidator),
    customModifierText: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const execution = await ctx.db.get(args.executionId);
    if (!execution || execution.userId !== userId) {
      throw new Error("Workout execution not found for user.");
    }

    if (
      typeof args.rpe === "number" &&
      (!Number.isInteger(args.rpe) || args.rpe < 1 || args.rpe > 10)
    ) {
      throw new Error("RPE must be an integer from 1 to 10.");
    }

    await ctx.db.patch(execution._id, {
      checkInStatus: "submitted",
      rpe: args.rpe,
      modifiers: args.modifiers,
      customModifierText: args.customModifierText?.trim() || undefined,
      notes: args.notes?.trim() || undefined,
      feedbackStatus: "pending",
      updatedAt: Date.now(),
    });

    await regenerateFeedbackForExecution(ctx, execution._id);

    return {
      executionId: execution._id,
      checkInStatus: "submitted" as const,
    };
  },
});

export const linkImportedWorkout = mutation({
  args: {
    healthKitWorkoutId: v.id("healthKitWorkouts"),
    plannedWorkoutId: v.id("workouts"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const executionId = await linkExecutionToPlannedWorkout(ctx, {
      userId,
      healthKitWorkoutId: args.healthKitWorkoutId,
      plannedWorkoutId: args.plannedWorkoutId,
    });

    return {
      executionId,
      matchStatus: "matched" as const,
    };
  },
});

export const unlinkImportedWorkout = mutation({
  args: {
    executionId: v.id("workoutExecutions"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    await unlinkExecution(ctx, {
      userId,
      executionId: args.executionId,
    });

    return {
      executionId: args.executionId,
      matchStatus: "unmatched" as const,
    };
  },
});

export const reconcileImportedWorkout = mutation({
  args: {
    healthKitWorkoutId: v.id("healthKitWorkouts"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const executionId = await reconcileImportedWorkoutExecution(ctx, {
      userId,
      healthKitWorkoutId: args.healthKitWorkoutId,
    });

    return {
      executionId,
    };
  },
});

export const skipWorkout = mutation({
  args: {
    workoutId: v.id("workouts"),
    reason: v.optional(v.string()),
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
    if (!plan || plan.userId !== userId || plan.status !== "active") {
      throw new Error("Workout not found on the active plan.");
    }

    const linkedExecution = await ctx.db
      .query("workoutExecutions")
      .withIndex("by_planned_workout_id", (queryBuilder) => queryBuilder.eq("plannedWorkoutId", workout._id))
      .unique();
    if (linkedExecution?.matchStatus === "matched") {
      throw new Error("Completed workouts cannot be skipped.");
    }

    await ctx.db.patch(workout._id, {
      status: "skipped",
      updatedAt: Date.now(),
    });

    const goal = await ctx.db.get(plan.goalId);
    const reason = args.reason?.trim();
    await ctx.db.insert("coachMessages", {
      userId,
      author: "coach",
      kind: "event",
      body: reason
        ? `Skipped ${workout.type} in week ${week.weekNumber} for ${goal?.label ?? "your active plan"}: ${reason}.`
        : `Skipped ${workout.type} in week ${week.weekNumber} for ${goal?.label ?? "your active plan"}.`,
      planId: plan._id,
      createdAt: Date.now(),
    });

    return {
      workoutId: workout._id,
      status: "skipped" as const,
    };
  },
});

export const rescheduleWorkout = mutation({
  args: {
    workoutId: v.id("workouts"),
    newScheduledDateKey: v.string(),
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
    if (!plan || plan.userId !== userId || plan.status !== "active") {
      throw new Error("Workout not found on the active plan.");
    }

    const normalizedDateKey = args.newScheduledDateKey.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDateKey)) {
      throw new Error("newScheduledDateKey must use YYYY-MM-DD.");
    }

    if (normalizedDateKey < week.weekStartDateKey || normalizedDateKey > week.weekEndDateKey) {
      throw new Error("Workout can only be rescheduled within the same training week.");
    }

    const linkedExecution = await ctx.db
      .query("workoutExecutions")
      .withIndex("by_planned_workout_id", (queryBuilder) => queryBuilder.eq("plannedWorkoutId", workout._id))
      .unique();
    if (linkedExecution?.matchStatus === "matched") {
      throw new Error("Completed workouts cannot be rescheduled.");
    }

    await ctx.db.patch(workout._id, {
      scheduledDateKey: normalizedDateKey,
      status: "modified",
      updatedAt: Date.now(),
    });

    const goal = await ctx.db.get(plan.goalId);
    await ctx.db.insert("coachMessages", {
      userId,
      author: "coach",
      kind: "event",
      body: `Moved ${workout.type} in ${goal?.label ?? "your active plan"} to ${normalizedDateKey}.`,
      planId: plan._id,
      createdAt: Date.now(),
    });

    return {
      workoutId: workout._id,
      status: "modified" as const,
      scheduledDateKey: normalizedDateKey,
    };
  },
});

export const bumpWorkout = mutation({
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
    if (!plan || plan.userId !== userId || plan.status !== "active") {
      throw new Error("Workout not found on the active plan.");
    }

    const weekWorkouts = await ctx.db
      .query("workouts")
      .withIndex("by_week_id_scheduled_date_key", (queryBuilder) => queryBuilder.eq("weekId", week._id))
      .collect();

    const targetWorkouts = [...weekWorkouts]
      .filter((entry) => entry.scheduledDateKey >= workout.scheduledDateKey)
      .sort((left, right) => {
        if (left.scheduledDateKey !== right.scheduledDateKey) {
          return left.scheduledDateKey.localeCompare(right.scheduledDateKey);
        }
        return left.createdAt - right.createdAt;
      });

    let finalDate = workout.scheduledDateKey as DateKey;
    for (let index = 0; index < targetWorkouts.length; index += 1) {
      finalDate = addDays(workout.scheduledDateKey as DateKey, index + 1);
    }

    if (finalDate > (week.weekEndDateKey as DateKey)) {
      throw new Error("Workout cannot be bumped because there is no room left in the week.");
    }

    for (let index = targetWorkouts.length - 1; index >= 0; index -= 1) {
      const entry = targetWorkouts[index]!;
      await ctx.db.patch(entry._id, {
        scheduledDateKey: addDays(entry.scheduledDateKey as DateKey, 1),
        status: "modified",
        updatedAt: Date.now(),
      });
    }

    await ctx.db.insert("coachMessages", {
      userId,
      author: "coach",
      kind: "event",
      body: `Bumped ${workout.type} forward within week ${week.weekNumber}.`,
      planId: plan._id,
      createdAt: Date.now(),
    });

    return {
      workoutId: workout._id,
      status: "modified" as const,
    };
  },
});
