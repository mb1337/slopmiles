import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";

import type { Weekday } from "./constants";

const DEFAULT_DAYS: Weekday[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

async function ensureRunningSchedule(ctx: MutationCtx, userId: Id<"users">, now: number) {
  let runningSchedule = await ctx.db
    .query("runningSchedules")
    .withIndex("by_user_id", (query) => query.eq("userId", userId))
    .unique();

  if (!runningSchedule) {
    const scheduleId = await ctx.db.insert("runningSchedules", {
      userId,
      preferredRunningDays: DEFAULT_DAYS,
      runningDaysPerWeek: 5,
      preferredQualityDays: ["tuesday", "thursday"],
      updatedAt: now,
    });
    runningSchedule = await ctx.db.get(scheduleId);
  }

  if (!runningSchedule) {
    throw new Error("Failed to initialize running schedule");
  }

  return runningSchedule;
}

async function ensureOnboardingState(ctx: MutationCtx, userId: Id<"users">, now: number) {
  let onboardingState = await ctx.db
    .query("onboardingStates")
    .withIndex("by_user_id", (query) => query.eq("userId", userId))
    .unique();

  if (!onboardingState) {
    const stateId = await ctx.db.insert("onboardingStates", {
      userId,
      currentStep: "welcome",
      isComplete: false,
      updatedAt: now,
    });
    onboardingState = await ctx.db.get(stateId);
  }

  if (!onboardingState) {
    throw new Error("Failed to initialize onboarding state");
  }

  return onboardingState;
}

async function ensureCompetitiveness(ctx: MutationCtx, userId: Id<"users">, now: number) {
  let competitiveness = await ctx.db
    .query("competitiveness")
    .withIndex("by_user_id", (query) => query.eq("userId", userId))
    .unique();

  if (!competitiveness) {
    const competitivenessId = await ctx.db.insert("competitiveness", {
      userId,
      level: "balanced",
      updatedAt: now,
    });
    competitiveness = await ctx.db.get(competitivenessId);
  }

  if (!competitiveness) {
    throw new Error("Failed to initialize competitiveness");
  }

  return competitiveness;
}

async function ensurePersonality(ctx: MutationCtx, userId: Id<"users">, now: number) {
  let personality = await ctx.db
    .query("personalities")
    .withIndex("by_user_id", (query) => query.eq("userId", userId))
    .unique();

  if (!personality) {
    const personalityId = await ctx.db.insert("personalities", {
      userId,
      name: "noNonsense",
      isPreset: true,
      description: "Brief, direct, no fluff.",
      updatedAt: now,
    });
    personality = await ctx.db.get(personalityId);
  }

  if (!personality) {
    throw new Error("Failed to initialize personality");
  }

  return personality;
}

export const bootstrapAnonymous = mutation({
  args: {
    anonymousHandle: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    let user = await ctx.db
      .query("users")
      .withIndex("by_anonymous_handle", (query) => query.eq("anonymousHandle", args.anonymousHandle))
      .unique();

    if (!user) {
      const userId = await ctx.db.insert("users", {
        anonymousHandle: args.anonymousHandle,
        name: "Runner",
        unitPreference: "system",
        volumePreference: "time",
        trackAccess: false,
        healthKitAuthorized: false,
        createdAt: now,
        updatedAt: now,
      });

      user = await ctx.db.get(userId);
    }

    if (!user) {
      throw new Error("Failed to bootstrap anonymous user");
    }

    const runningSchedule = await ensureRunningSchedule(ctx, user._id, now);
    const onboardingState = await ensureOnboardingState(ctx, user._id, now);
    const competitiveness = await ensureCompetitiveness(ctx, user._id, now);
    const personality = await ensurePersonality(ctx, user._id, now);

    return {
      user,
      runningSchedule,
      onboardingState,
      competitiveness,
      personality,
    };
  },
});

export const resetAppData = mutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found.");
    }

    const plans = await ctx.db
      .query("trainingPlans")
      .withIndex("by_user_id", (query) => query.eq("userId", args.userId))
      .collect();
    for (const plan of plans) {
      await ctx.db.delete(plan._id);
    }

    const goals = await ctx.db
      .query("goals")
      .withIndex("by_user_id", (query) => query.eq("userId", args.userId))
      .collect();
    for (const goal of goals) {
      await ctx.db.delete(goal._id);
    }

    const schedules = await ctx.db
      .query("runningSchedules")
      .withIndex("by_user_id", (query) => query.eq("userId", args.userId))
      .collect();
    for (const schedule of schedules) {
      await ctx.db.delete(schedule._id);
    }

    const onboardingStates = await ctx.db
      .query("onboardingStates")
      .withIndex("by_user_id", (query) => query.eq("userId", args.userId))
      .collect();
    for (const onboardingState of onboardingStates) {
      await ctx.db.delete(onboardingState._id);
    }

    const competitivenessRows = await ctx.db
      .query("competitiveness")
      .withIndex("by_user_id", (query) => query.eq("userId", args.userId))
      .collect();
    for (const competitiveness of competitivenessRows) {
      await ctx.db.delete(competitiveness._id);
    }

    const personalities = await ctx.db
      .query("personalities")
      .withIndex("by_user_id", (query) => query.eq("userId", args.userId))
      .collect();
    for (const personality of personalities) {
      await ctx.db.delete(personality._id);
    }

    const now = Date.now();
    await ctx.db.patch(args.userId, {
      name: "Runner",
      unitPreference: "system",
      volumePreference: "time",
      trackAccess: false,
      healthKitAuthorized: false,
      currentVDOT: undefined,
      maxHeartRate: undefined,
      restingHeartRate: undefined,
      updatedAt: now,
    });

    await ensureRunningSchedule(ctx, args.userId, now);
    await ensureOnboardingState(ctx, args.userId, now);
    await ensureCompetitiveness(ctx, args.userId, now);
    await ensurePersonality(ctx, args.userId, now);
  },
});
