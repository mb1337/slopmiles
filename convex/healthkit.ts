import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

import { internal } from "./_generated/api";
import { internalAction, internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { healthKitSyncSources } from "./constants";
import { normalizeImportedWorkoutIntervals } from "./healthkitIntervals";
import { buildHealthKitImportUserPatch, buildHealthKitSyncStatusPatch } from "./healthkitSyncState";
import { historyWorkoutStatusFromExecution, reconcileImportedWorkoutExecution } from "./workoutExecutionHelpers";

const importedWorkoutIntervalValidator = v.object({
  startedAt: v.number(),
  endedAt: v.number(),
  durationSeconds: v.number(),
  distanceMeters: v.optional(v.number()),
  rawPaceSecondsPerMeter: v.optional(v.number()),
  gradeAdjustedPaceSecondsPerMeter: v.optional(v.number()),
  equivalentFlatDistanceMeters: v.optional(v.number()),
  elevationAscentMeters: v.optional(v.number()),
  elevationDescentMeters: v.optional(v.number()),
  averageHeartRate: v.optional(v.number()),
});

const importedWorkoutValidator = v.object({
  externalWorkoutId: v.string(),
  startedAt: v.number(),
  endedAt: v.number(),
  durationSeconds: v.number(),
  distanceMeters: v.optional(v.number()),
  rawPaceSecondsPerMeter: v.optional(v.number()),
  gradeAdjustedPaceSecondsPerMeter: v.optional(v.number()),
  equivalentFlatDistanceMeters: v.optional(v.number()),
  elevationAscentMeters: v.optional(v.number()),
  elevationDescentMeters: v.optional(v.number()),
  averageHeartRate: v.optional(v.number()),
  maxHeartRate: v.optional(v.number()),
  intervals: v.optional(v.array(importedWorkoutIntervalValidator)),
  sourceName: v.optional(v.string()),
  sourceBundleIdentifier: v.optional(v.string()),
});
const healthKitSyncSourceValidator = v.union(...healthKitSyncSources.map((source) => v.literal(source)));
const RECONCILIATION_BATCH_SIZE = 8;
const HEALTHKIT_IMPORT_LOOKBACK_DAYS = 84;

export function filterWorkoutsWithinLookbackWindow<T extends { startedAt: number }>(
  workouts: T[],
  now: number,
): T[] {
  const earliestAllowedStartedAt = now - HEALTHKIT_IMPORT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  return workouts.filter((workout) => workout.startedAt >= earliestAllowedStartedAt);
}

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
    source: v.optional(healthKitSyncSourceValidator),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedMutationUserId(ctx);
    const now = Date.now();
    const workoutsToImport = filterWorkoutsWithinLookbackWindow(args.workouts, now);
    let insertedCount = 0;
    let updatedCount = 0;
    const importedWorkoutIds: Id<"healthKitWorkouts">[] = [];

    for (const workout of workoutsToImport) {
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
        equivalentFlatDistanceMeters: workout.equivalentFlatDistanceMeters,
        elevationAscentMeters: workout.elevationAscentMeters,
        elevationDescentMeters: workout.elevationDescentMeters,
        averageHeartRate: workout.averageHeartRate,
        maxHeartRate: workout.maxHeartRate,
        intervals: normalizeImportedWorkoutIntervals(workout),
        sourceName: workout.sourceName,
        sourceBundleIdentifier: workout.sourceBundleIdentifier,
        historyStatus: existing?.historyStatus ?? "unplanned",
        importedAt: now,
        updatedAt: now,
      };

      if (existing) {
        await ctx.db.patch(existing._id, payload);
        importedWorkoutIds.push(existing._id);
        updatedCount += 1;
      } else {
        const insertedWorkoutId = await ctx.db.insert("healthKitWorkouts", {
          ...payload,
          createdAt: now,
        });
        importedWorkoutIds.push(insertedWorkoutId);
        insertedCount += 1;
      }
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("User not found.");
    }

    await ctx.db.patch(
      userId,
      buildHealthKitImportUserPatch({
        user,
        now,
        source: args.source ?? "manual",
        restingHeartRate: args.restingHeartRate,
        inferredMaxHeartRate: args.inferredMaxHeartRate,
      }),
    );

    if (importedWorkoutIds.length > 0) {
      await ctx.scheduler.runAfter(0, internal.healthkit.processImportedWorkoutReconciliation, {
        userId,
        healthKitWorkoutIds: importedWorkoutIds,
      });
    }

    return {
      insertedCount,
      updatedCount,
      processedCount: workoutsToImport.length,
    };
  },
});

export const reconcileImportedWorkoutExecutionInternal = internalMutation({
  args: {
    userId: v.id("users"),
    healthKitWorkoutId: v.id("healthKitWorkouts"),
  },
  handler: async (ctx, args) => {
    await reconcileImportedWorkoutExecution(ctx, args);
  },
});

export const processImportedWorkoutReconciliation = internalAction({
  args: {
    userId: v.id("users"),
    healthKitWorkoutIds: v.array(v.id("healthKitWorkouts")),
  },
  handler: async (ctx, args) => {
    const batch = args.healthKitWorkoutIds.slice(0, RECONCILIATION_BATCH_SIZE);
    const remaining = args.healthKitWorkoutIds.slice(RECONCILIATION_BATCH_SIZE);

    for (const healthKitWorkoutId of batch) {
      await ctx.runMutation(internal.healthkit.reconcileImportedWorkoutExecutionInternal, {
        userId: args.userId,
        healthKitWorkoutId,
      });
    }

    if (remaining.length > 0) {
      await ctx.scheduler.runAfter(0, internal.healthkit.processImportedWorkoutReconciliation, {
        userId: args.userId,
        healthKitWorkoutIds: remaining,
      });
    }
  },
});

export const setSyncStatus = mutation({
  args: {
    source: v.optional(healthKitSyncSourceValidator),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedMutationUserId(ctx);
    const now = Date.now();
    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("User not found.");
    }

    await ctx.db.patch(
      userId,
      buildHealthKitSyncStatusPatch({
        user,
        now,
        source: args.source,
        error: args.error,
      }),
    );
  },
});

export const backfillHistoryStatuses = internalMutation({
  args: {},
  handler: async (ctx) => {
    const workouts = await ctx.db.query("healthKitWorkouts").collect();

    for (const workout of workouts) {
      const execution = await ctx.db
        .query("workoutExecutions")
        .withIndex("by_healthkit_workout_id", (queryBuilder) =>
          queryBuilder.eq("healthKitWorkoutId", workout._id),
        )
        .unique();

      const historyStatus = historyWorkoutStatusFromExecution(execution);
      if (workout.historyStatus !== historyStatus) {
        await ctx.db.patch(workout._id, { historyStatus });
      }
    }

    return {
      workoutCount: workouts.length,
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

    const user = await ctx.db.get(userId);

    return {
      workoutCount: workouts.length,
      lastImportedAt,
      lastSyncAt: user?.healthKitLastSyncAt ?? null,
      lastSyncSource: user?.healthKitLastSyncSource ?? null,
      lastSyncError: user?.healthKitLastSyncError ?? null,
    };
  },
});

export const getSyncSummary = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuthenticatedQueryUserId(ctx);
    const user = await ctx.db.get(userId);

    return {
      lastSyncAt: user?.healthKitLastSyncAt ?? null,
      lastSyncSource: user?.healthKitLastSyncSource ?? null,
      lastSyncError: user?.healthKitLastSyncError ?? null,
    };
  },
});

export const getImportedWorkoutDetail = query({
  args: {
    healthKitWorkoutId: v.id("healthKitWorkouts"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedQueryUserId(ctx);
    const workout = await ctx.db.get(args.healthKitWorkoutId);
    if (!workout || workout.userId !== userId) {
      throw new Error("Imported workout not found.");
    }

    const execution = await ctx.db
      .query("workoutExecutions")
      .withIndex("by_healthkit_workout_id", (queryBuilder) =>
        queryBuilder.eq("healthKitWorkoutId", workout._id),
      )
      .unique();

    return {
      ...workout,
      intervals: normalizeImportedWorkoutIntervals(workout),
      execution: execution
        ? {
            _id: execution._id,
            matchStatus: execution.matchStatus,
          }
        : null,
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

    return await ctx.db
      .query("healthKitWorkouts")
      .withIndex("by_user_id_started_at", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
  },
});
