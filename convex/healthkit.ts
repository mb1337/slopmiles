import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { listExecutionSummariesByHealthKitWorkoutId, reconcileImportedWorkoutExecution } from "./workoutExecutionHelpers";

const importedWorkoutIntervalValidator = v.object({
  type: v.union(v.literal("lap"), v.literal("segment")),
  startedAt: v.number(),
  endedAt: v.number(),
  durationSeconds: v.number(),
  distanceMeters: v.optional(v.number()),
  rawPaceSecondsPerMeter: v.optional(v.number()),
  gradeAdjustedPaceSecondsPerMeter: v.optional(v.number()),
  averageHeartRate: v.optional(v.number()),
});

const importedWorkoutIntervalChainValidator = v.object({
  chainIndex: v.number(),
  startedAt: v.number(),
  endedAt: v.number(),
  durationSeconds: v.number(),
  intervalCount: v.number(),
  distanceMeters: v.optional(v.number()),
  intervals: v.array(importedWorkoutIntervalValidator),
});

const importedWorkoutValidator = v.object({
  externalWorkoutId: v.string(),
  startedAt: v.number(),
  endedAt: v.number(),
  durationSeconds: v.number(),
  distanceMeters: v.optional(v.number()),
  rawPaceSecondsPerMeter: v.optional(v.number()),
  gradeAdjustedPaceSecondsPerMeter: v.optional(v.number()),
  elevationAscentMeters: v.optional(v.number()),
  elevationDescentMeters: v.optional(v.number()),
  averageHeartRate: v.optional(v.number()),
  maxHeartRate: v.optional(v.number()),
  intervalChains: v.optional(v.array(importedWorkoutIntervalChainValidator)),
  sourceName: v.optional(v.string()),
  sourceBundleIdentifier: v.optional(v.string()),
});

async function requireAuthenticatedMutationUserId(ctx: MutationCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Authentication required.");
  }
  return userId;
}

async function requireAuthenticatedQueryUserId(ctx: QueryCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Authentication required.");
  }
  return userId;
}

export const setAuthorizationStatus = mutation({
  args: {
    authorized: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedMutationUserId(ctx);
    await ctx.db.patch(userId, {
      healthKitAuthorized: args.authorized,
      updatedAt: Date.now(),
    });
  },
});

export const seedImportWorkouts = mutation({
  args: {
    workouts: v.array(importedWorkoutValidator),
    restingHeartRate: v.optional(v.number()),
    inferredMaxHeartRate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedMutationUserId(ctx);
    const now = Date.now();
    let insertedCount = 0;
    let updatedCount = 0;

    for (const workout of args.workouts) {
      const existing = await ctx.db
        .query("healthKitWorkouts")
        .withIndex("by_user_id_external_workout_id", (q) =>
          q.eq("userId", userId).eq("externalWorkoutId", workout.externalWorkoutId),
        )
        .unique();

      const payload = {
        userId,
        externalWorkoutId: workout.externalWorkoutId,
        startedAt: workout.startedAt,
        endedAt: workout.endedAt,
        durationSeconds: workout.durationSeconds,
        distanceMeters: workout.distanceMeters,
        rawPaceSecondsPerMeter: workout.rawPaceSecondsPerMeter,
        gradeAdjustedPaceSecondsPerMeter: workout.gradeAdjustedPaceSecondsPerMeter,
        elevationAscentMeters: workout.elevationAscentMeters,
        elevationDescentMeters: workout.elevationDescentMeters,
        averageHeartRate: workout.averageHeartRate,
        maxHeartRate: workout.maxHeartRate,
        intervalChains: workout.intervalChains,
        sourceName: workout.sourceName,
        sourceBundleIdentifier: workout.sourceBundleIdentifier,
        importedAt: now,
        updatedAt: now,
      };

      if (existing) {
        await ctx.db.patch(existing._id, payload);
        updatedCount += 1;
      } else {
        await ctx.db.insert("healthKitWorkouts", {
          ...payload,
          createdAt: now,
        });
        insertedCount += 1;
      }
    }

    const importedWorkoutDocs = await ctx.db
      .query("healthKitWorkouts")
      .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
      .collect();

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("User not found.");
    }

    await ctx.db.patch(userId, {
      restingHeartRate: args.restingHeartRate,
      maxHeartRate: typeof user.maxHeartRate === "number" ? user.maxHeartRate : args.inferredMaxHeartRate,
      updatedAt: now,
    });

    const importedWorkoutIds = new Set(
      args.workouts.map((workout) => workout.externalWorkoutId),
    );
    for (const importedWorkout of importedWorkoutDocs) {
      if (!importedWorkoutIds.has(importedWorkout.externalWorkoutId)) {
        continue;
      }

      await reconcileImportedWorkoutExecution(ctx, {
        userId,
        healthKitWorkoutId: importedWorkout._id,
      });
    }

    return {
      insertedCount,
      updatedCount,
      processedCount: args.workouts.length,
    };
  },
});

export const getImportSummary = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuthenticatedQueryUserId(ctx);
    const workouts = await ctx.db
      .query("healthKitWorkouts")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .collect();

    let lastImportedAt: number | null = null;
    for (const workout of workouts) {
      if (lastImportedAt === null || workout.importedAt > lastImportedAt) {
        lastImportedAt = workout.importedAt;
      }
    }

    return {
      workoutCount: workouts.length,
      lastImportedAt,
    };
  },
});

export const listImportedWorkouts = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedQueryUserId(ctx);
    const limit = typeof args.limit === "number" ? Math.max(1, Math.min(200, Math.floor(args.limit))) : 50;

    const [workouts, executionSummaryByHealthKitWorkoutId] = await Promise.all([
      ctx.db
      .query("healthKitWorkouts")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .collect(),
      listExecutionSummariesByHealthKitWorkoutId(ctx, userId),
    ]);

    return workouts
      .sort((left, right) => right.startedAt - left.startedAt)
      .slice(0, limit)
      .map((workout) => ({
        ...workout,
        execution: executionSummaryByHealthKitWorkoutId.get(String(workout._id)) ?? null,
      }));
  },
});
