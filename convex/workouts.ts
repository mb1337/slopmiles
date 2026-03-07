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
      .collect();

    return getMatchCandidateRecords(ctx, {
      userId,
      healthKitWorkoutId: args.healthKitWorkoutId,
      excludeExecutionId: execution[0]?._id,
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
