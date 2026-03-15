import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { distanceUnits, surfaceTypes } from "./constants";

export {
  resetAppData,
  updateCompetitiveness,
  updateName,
  updatePersonality,
  updateRunningSchedule,
  updateStrengthPreferences,
  updateTrackAccess,
  updateUnitPreference,
  updateVolumePreference,
} from "./users";

const distanceUnitValidator = v.union(...distanceUnits.map((item) => v.literal(item)));
const surfaceTypeValidator = v.union(...surfaceTypes.map((item) => v.literal(item)));

async function requireAuthenticatedUserId(ctx: QueryCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Authentication required.");
  }

  return userId;
}

async function requireAuthenticatedMutationUserId(ctx: MutationCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Authentication required.");
  }

  return userId;
}

export const getSettingsView = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const [user, runningSchedule, competitiveness, personality, courses, races, activePlan] = await Promise.all([
      ctx.db.get(userId),
      ctx.db
        .query("runningSchedules")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
        .unique(),
      ctx.db
        .query("competitiveness")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
        .unique(),
      ctx.db
        .query("personalities")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
        .unique(),
      ctx.db
        .query("courses")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
        .collect(),
      ctx.db
        .query("races")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
        .collect(),
      ctx.db
        .query("trainingPlans")
        .withIndex("by_user_id_status", (queryBuilder) => queryBuilder.eq("userId", userId).eq("status", "active"))
        .take(1),
    ]);

    return {
      user,
      runningSchedule,
      competitiveness,
      personality,
      strengthPreference: {
        enabled: user?.strengthTrainingEnabled ?? false,
        equipment: user?.strengthEquipment ?? [],
      },
      hasActivePlan: activePlan.length > 0,
      courses: courses.sort((left, right) => left.name.localeCompare(right.name)),
      races: races.sort((left, right) => right.plannedDate - left.plannedDate),
      healthKit: {
        authorized: user?.healthKitAuthorized ?? false,
        lastSyncAt: user?.healthKitLastSyncAt ?? null,
        lastSyncSource: user?.healthKitLastSyncSource ?? null,
        lastSyncError: user?.healthKitLastSyncError ?? null,
      },
    };
  },
});

export const exportData = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const [
      user,
      runningSchedule,
      competitiveness,
      personality,
      plans,
      goals,
      executions,
      healthKitWorkouts,
      races,
      courses,
      assessments,
    ] = await Promise.all([
      ctx.db.get(userId),
      ctx.db.query("runningSchedules").withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId)).unique(),
      ctx.db.query("competitiveness").withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId)).unique(),
      ctx.db.query("personalities").withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId)).unique(),
      ctx.db.query("trainingPlans").withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId)).collect(),
      ctx.db.query("goals").withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId)).collect(),
      ctx.db.query("workoutExecutions").withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId)).collect(),
      ctx.db.query("healthKitWorkouts").withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId)).collect(),
      ctx.db.query("races").withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId)).collect(),
      ctx.db.query("courses").withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId)).collect(),
      ctx.db.query("planAssessments").withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId)).collect(),
    ]);

    const weekGroups = await Promise.all(
      plans.map((plan) =>
        ctx.db
          .query("trainingWeeks")
          .withIndex("by_plan_id", (queryBuilder) => queryBuilder.eq("planId", plan._id))
          .collect(),
      ),
    );
    const weeks = weekGroups.flat();
    const workoutGroups = await Promise.all(
      weeks.map((week) =>
        ctx.db
          .query("workouts")
          .withIndex("by_week_id", (queryBuilder) => queryBuilder.eq("weekId", week._id))
          .collect(),
      ),
    );
    const workouts = workoutGroups.flat();

    return {
      exportedAt: Date.now(),
      profile: user,
      runningSchedule,
      competitiveness: competitiveness?.level ?? "balanced",
      personality: personality ?? null,
      strengthPreference: {
        enabled: user?.strengthTrainingEnabled ?? false,
        equipment: user?.strengthEquipment ?? [],
      },
      goals,
      plans,
      weeks,
      workouts,
      executions,
      healthKitWorkouts,
      races,
      courses,
      assessments,
    };
  },
});

export const upsertCourse = mutation({
  args: {
    courseId: v.optional(v.id("courses")),
    name: v.string(),
    distanceMeters: v.number(),
    distanceUnit: distanceUnitValidator,
    surface: surfaceTypeValidator,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedMutationUserId(ctx);
    const now = Date.now();

    if (args.courseId) {
      const course = await ctx.db.get(args.courseId);
      if (!course || course.userId !== userId) {
        throw new Error("Course not found.");
      }

      await ctx.db.patch(course._id, {
        name: args.name.trim(),
        distanceMeters: args.distanceMeters,
        distanceUnit: args.distanceUnit,
        surface: args.surface,
        notes: args.notes?.trim() || undefined,
        updatedAt: now,
      });
      return course._id;
    }

    return await ctx.db.insert("courses", {
      userId,
      name: args.name.trim(),
      distanceMeters: args.distanceMeters,
      distanceUnit: args.distanceUnit,
      surface: args.surface,
      notes: args.notes?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const deleteCourse = mutation({
  args: {
    courseId: v.id("courses"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedMutationUserId(ctx);
    const course = await ctx.db.get(args.courseId);
    if (!course || course.userId !== userId) {
      throw new Error("Course not found.");
    }
    await ctx.db.delete(course._id);
  },
});

export const upsertRace = mutation({
  args: {
    raceId: v.optional(v.id("races")),
    label: v.string(),
    plannedDate: v.number(),
    distanceMeters: v.number(),
    goalTimeSeconds: v.optional(v.number()),
    actualTimeSeconds: v.optional(v.number()),
    isPrimaryGoal: v.boolean(),
    planId: v.optional(v.id("trainingPlans")),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedMutationUserId(ctx);
    const now = Date.now();

    if (args.raceId) {
      const race = await ctx.db.get(args.raceId);
      if (!race || race.userId !== userId) {
        throw new Error("Race not found.");
      }

      await ctx.db.patch(race._id, {
        label: args.label.trim(),
        plannedDate: args.plannedDate,
        distanceMeters: args.distanceMeters,
        goalTimeSeconds: args.goalTimeSeconds,
        actualTimeSeconds: args.actualTimeSeconds,
        isPrimaryGoal: args.isPrimaryGoal,
        planId: args.planId,
        updatedAt: now,
      });
      return race._id;
    }

    return await ctx.db.insert("races", {
      userId,
      label: args.label.trim(),
      plannedDate: args.plannedDate,
      distanceMeters: args.distanceMeters,
      goalTimeSeconds: args.goalTimeSeconds,
      actualTimeSeconds: args.actualTimeSeconds,
      isPrimaryGoal: args.isPrimaryGoal,
      planId: args.planId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const deleteRace = mutation({
  args: {
    raceId: v.id("races"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedMutationUserId(ctx);
    const race = await ctx.db.get(args.raceId);
    if (!race || race.userId !== userId) {
      throw new Error("Race not found.");
    }
    if (race.isPrimaryGoal) {
      throw new Error("Primary goal race cannot be removed.");
    }
    if (race.actualTimeSeconds) {
      throw new Error("Completed races cannot be removed.");
    }
    await ctx.db.delete(race._id);
  },
});
