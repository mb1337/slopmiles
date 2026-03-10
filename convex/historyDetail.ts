import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { normalizeImportedWorkoutIntervals } from "./healthkitIntervals";
import { getExecutionDetailRecord } from "./workoutExecutionHelpers";

async function requireAuthenticatedUserId(ctx: QueryCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Authentication required.");
  }

  return userId;
}

export const getHistoryDetailView = query({
  args: {
    healthKitWorkoutId: v.id("healthKitWorkouts"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const workout = await ctx.db.get(args.healthKitWorkoutId);
    if (!workout || workout.userId !== userId) {
      throw new Error("Imported workout not found.");
    }

    const execution = await ctx.db
      .query("workoutExecutions")
      .withIndex("by_healthkit_workout_id", (queryBuilder) => queryBuilder.eq("healthKitWorkoutId", workout._id))
      .unique();
    const executionDetail = execution ? await getExecutionDetailRecord(ctx, userId, execution._id) : null;

    return {
      workout: {
        ...workout,
        intervals: normalizeImportedWorkoutIntervals(workout),
        execution: execution
          ? {
              _id: execution._id,
              matchStatus: execution.matchStatus,
            }
          : null,
      },
      executionDetail,
    };
  },
});
