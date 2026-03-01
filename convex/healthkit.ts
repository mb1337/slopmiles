import { v } from "convex/values";

import { mutation, query } from "./_generated/server";

const importedWorkoutIntervalValidator = v.object({
  type: v.union(v.literal("lap"), v.literal("segment")),
  startedAt: v.number(),
  endedAt: v.number(),
  durationSeconds: v.number(),
  distanceMeters: v.optional(v.number()),
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
  averageHeartRate: v.optional(v.number()),
  maxHeartRate: v.optional(v.number()),
  intervalChains: v.optional(v.array(importedWorkoutIntervalChainValidator)),
  sourceName: v.optional(v.string()),
  sourceBundleIdentifier: v.optional(v.string()),
});

export const setAuthorizationStatus = mutation({
  args: {
    userId: v.id("users"),
    authorized: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      healthKitAuthorized: args.authorized,
      updatedAt: Date.now(),
    });
  },
});

export const seedImportWorkouts = mutation({
  args: {
    userId: v.id("users"),
    workouts: v.array(importedWorkoutValidator),
    restingHeartRate: v.optional(v.number()),
    inferredMaxHeartRate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let insertedCount = 0;
    let updatedCount = 0;

    for (const workout of args.workouts) {
      const existing = await ctx.db
        .query("healthKitWorkouts")
        .withIndex("by_user_id_external_workout_id", (q) =>
          q.eq("userId", args.userId).eq("externalWorkoutId", workout.externalWorkoutId),
        )
        .unique();

      const payload = {
        userId: args.userId,
        externalWorkoutId: workout.externalWorkoutId,
        startedAt: workout.startedAt,
        endedAt: workout.endedAt,
        durationSeconds: workout.durationSeconds,
        distanceMeters: workout.distanceMeters,
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

    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found.");
    }

    await ctx.db.patch(args.userId, {
      restingHeartRate: args.restingHeartRate,
      maxHeartRate: typeof user.maxHeartRate === "number" ? user.maxHeartRate : args.inferredMaxHeartRate,
      updatedAt: now,
    });

    return {
      insertedCount,
      updatedCount,
      processedCount: args.workouts.length,
    };
  },
});

export const getImportSummary = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const workouts = await ctx.db
      .query("healthKitWorkouts")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
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
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = typeof args.limit === "number" ? Math.max(1, Math.min(200, Math.floor(args.limit))) : 50;

    const workouts = await ctx.db
      .query("healthKitWorkouts")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .collect();

    return workouts.sort((left, right) => right.startedAt - left.startedAt).slice(0, limit);
  },
});
