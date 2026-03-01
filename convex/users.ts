import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, type MutationCtx } from "./_generated/server";

import { unitPreferences, type Weekday } from "./constants";

const unitPreferenceValidator = v.union(...unitPreferences.map((unit) => v.literal(unit)));

const DEFAULT_DAYS: Weekday[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

async function requireAuthenticatedUserId(ctx: MutationCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Authentication required.");
  }
  return userId;
}

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

export const bootstrapSession = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    const user = await ctx.db.get(userId);

    if (!user) {
      return null;
    }

    const runningSchedule = await ensureRunningSchedule(ctx, userId, now);
    const onboardingState = await ensureOnboardingState(ctx, userId, now);
    const competitiveness = await ensureCompetitiveness(ctx, userId, now);
    const personality = await ensurePersonality(ctx, userId, now);

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
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("User not found.");
    }

    const appleDefaultName = user.appleDefaultName?.trim();
    const currentName = user.name.trim();
    const fallbackName = currentName.length > 0 && currentName.toLowerCase() !== "runner" ? currentName : "Runner";
    const resetName = appleDefaultName && appleDefaultName.length > 0 ? appleDefaultName : fallbackName;

    const plans = await ctx.db
      .query("trainingPlans")
      .withIndex("by_user_id", (query) => query.eq("userId", userId))
      .collect();
    for (const plan of plans) {
      await ctx.db.delete(plan._id);
    }

    const goals = await ctx.db
      .query("goals")
      .withIndex("by_user_id", (query) => query.eq("userId", userId))
      .collect();
    for (const goal of goals) {
      await ctx.db.delete(goal._id);
    }

    const schedules = await ctx.db
      .query("runningSchedules")
      .withIndex("by_user_id", (query) => query.eq("userId", userId))
      .collect();
    for (const schedule of schedules) {
      await ctx.db.delete(schedule._id);
    }

    const onboardingStates = await ctx.db
      .query("onboardingStates")
      .withIndex("by_user_id", (query) => query.eq("userId", userId))
      .collect();
    for (const onboardingState of onboardingStates) {
      await ctx.db.delete(onboardingState._id);
    }

    const competitivenessRows = await ctx.db
      .query("competitiveness")
      .withIndex("by_user_id", (query) => query.eq("userId", userId))
      .collect();
    for (const competitiveness of competitivenessRows) {
      await ctx.db.delete(competitiveness._id);
    }

    const personalities = await ctx.db
      .query("personalities")
      .withIndex("by_user_id", (query) => query.eq("userId", userId))
      .collect();
    for (const personality of personalities) {
      await ctx.db.delete(personality._id);
    }

    const healthKitWorkouts = await ctx.db
      .query("healthKitWorkouts")
      .withIndex("by_user_id", (query) => query.eq("userId", userId))
      .collect();
    for (const workout of healthKitWorkouts) {
      await ctx.db.delete(workout._id);
    }

    const now = Date.now();
    await ctx.db.patch(userId, {
      name: resetName,
      appleDefaultName: appleDefaultName && appleDefaultName.length > 0 ? appleDefaultName : undefined,
      unitPreference: "system",
      volumePreference: "time",
      trackAccess: false,
      healthKitAuthorized: false,
      currentVDOT: undefined,
      maxHeartRate: undefined,
      restingHeartRate: undefined,
      updatedAt: now,
    });

    await ensureRunningSchedule(ctx, userId, now);
    await ensureOnboardingState(ctx, userId, now);
    await ensureCompetitiveness(ctx, userId, now);
    await ensurePersonality(ctx, userId, now);
  },
});

export const updateUnitPreference = mutation({
  args: {
    unitPreference: unitPreferenceValidator,
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    await ctx.db.patch(userId, {
      unitPreference: args.unitPreference,
      updatedAt: Date.now(),
    });
  },
});

export const setAppleDefaultNameForUser = internalMutation({
  args: {
    userId: v.id("users"),
    appleDefaultName: v.string(),
  },
  handler: async (ctx, args) => {
    const normalized = args.appleDefaultName.trim();
    if (normalized.length === 0) {
      return;
    }

    const [firstName] = normalized.split(/\s+/);
    const fallbackName = firstName ?? normalized;
    const user = await ctx.db.get(args.userId);
    if (!user) {
      return;
    }

    const currentDefaultName = user.appleDefaultName?.trim();
    const shouldSetDefault =
      !currentDefaultName || currentDefaultName.length === 0 || currentDefaultName.toLowerCase() === "runner";
    const currentName = user.name.trim();
    const shouldSetUserName =
      (currentName.length === 0 || currentName.toLowerCase() === "runner") && fallbackName.toLowerCase() !== "runner";

    if (!shouldSetDefault && !shouldSetUserName) {
      return;
    }

    await ctx.db.patch(args.userId, {
      ...(shouldSetDefault ? { appleDefaultName: fallbackName } : {}),
      ...(shouldSetUserName ? { name: fallbackName } : {}),
      updatedAt: Date.now(),
    });
  },
});

export const updateName = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("User not found.");
    }

    const name = args.name.trim();

    if (name.length === 0) {
      throw new Error("Name cannot be empty.");
    }

    const updates: {
      name: string;
      updatedAt: number;
      appleDefaultName?: string;
    } = {
      name,
      updatedAt: Date.now(),
    };

    const previousName = user.name.trim();
    if (!user.appleDefaultName && previousName.length > 0 && previousName.toLowerCase() !== "runner") {
      updates.appleDefaultName = previousName;
    }

    await ctx.db.patch(userId, updates);
  },
});
