import { v } from "convex/values";
import { mutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

import {
  competitivenessLevels,
  onboardingSteps,
  personalityPresets,
  unitPreferences,
  volumeModes,
  weekdays,
  type OnboardingStep,
} from "./constants";

const weekdayValidator = v.union(...weekdays.map((day) => v.literal(day)));
const onboardingStepValidator = v.union(...onboardingSteps.map((step) => v.literal(step)));
const unitPreferenceValidator = v.union(...unitPreferences.map((unit) => v.literal(unit)));
const volumeModeValidator = v.union(...volumeModes.map((mode) => v.literal(mode)));
const competitivenessValidator = v.union(...competitivenessLevels.map((level) => v.literal(level)));
const personalityPresetValidator = v.union(...personalityPresets.map((preset) => v.literal(preset)));

function nextStep(step: OnboardingStep): OnboardingStep {
  const index = onboardingSteps.indexOf(step);
  if (index < 0 || index >= onboardingSteps.length - 1) {
    return "done";
  }

  return onboardingSteps[index + 1] ?? "done";
}

async function ensureOnboardingState(ctx: MutationCtx, userId: Id<"users">) {
  let state = await ctx.db
    .query("onboardingStates")
      .withIndex("by_user_id", (query) => query.eq("userId", userId))
    .unique();

  if (!state) {
    const stateId = await ctx.db.insert("onboardingStates", {
      userId,
      currentStep: "welcome",
      isComplete: false,
      updatedAt: Date.now(),
    });
    state = await ctx.db.get(stateId);
  }

  if (!state) {
    throw new Error("Failed to initialize onboarding state");
  }

  return state;
}

async function advance(ctx: MutationCtx, userId: Id<"users">, completedStep: OnboardingStep) {
  const state = await ensureOnboardingState(ctx, userId);
  const complete = completedStep === "done";

  await ctx.db.patch(state._id, {
    currentStep: complete ? "done" : nextStep(completedStep),
    isComplete: complete,
    updatedAt: Date.now(),
  });
}

export const completeStep = mutation({
  args: {
    userId: v.id("users"),
    step: onboardingStepValidator,
  },
  handler: async (ctx, args) => {
    await advance(ctx, args.userId, args.step);
  },
});

export const saveProfileBasics = mutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
    unitPreference: unitPreferenceValidator,
    volumePreference: volumeModeValidator,
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      name: args.name,
      unitPreference: args.unitPreference,
      volumePreference: args.volumePreference,
      updatedAt: Date.now(),
    });

    await advance(ctx, args.userId, "profileBasics");
  },
});

export const saveRunningSchedule = mutation({
  args: {
    userId: v.id("users"),
    preferredRunningDays: v.array(weekdayValidator),
    runningDaysPerWeek: v.number(),
    preferredLongRunDay: v.optional(weekdayValidator),
    preferredQualityDays: v.array(weekdayValidator),
  },
  handler: async (ctx, args) => {
    if (args.preferredRunningDays.length === 0) {
      throw new Error("At least one preferred running day is required.");
    }

    if (args.runningDaysPerWeek > args.preferredRunningDays.length) {
      throw new Error("Running days per week must be less than or equal to available days.");
    }

    const schedule = await ctx.db
      .query("runningSchedules")
      .withIndex("by_user_id", (query) => query.eq("userId", args.userId))
      .unique();

    const payload = {
      preferredRunningDays: args.preferredRunningDays,
      runningDaysPerWeek: args.runningDaysPerWeek,
      preferredLongRunDay: args.preferredLongRunDay,
      preferredQualityDays: args.preferredQualityDays,
      updatedAt: Date.now(),
    };

    if (schedule) {
      await ctx.db.patch(schedule._id, payload);
    } else {
      await ctx.db.insert("runningSchedules", {
        userId: args.userId,
        ...payload,
      });
    }

    await advance(ctx, args.userId, "runningSchedule");
  },
});

export const saveTrackAccess = mutation({
  args: {
    userId: v.id("users"),
    trackAccess: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      trackAccess: args.trackAccess,
      updatedAt: Date.now(),
    });

    await advance(ctx, args.userId, "trackAccess");
  },
});

export const saveCompetitiveness = mutation({
  args: {
    userId: v.id("users"),
    level: competitivenessValidator,
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("competitiveness")
      .withIndex("by_user_id", (query) => query.eq("userId", args.userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        level: args.level,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("competitiveness", {
        userId: args.userId,
        level: args.level,
        updatedAt: Date.now(),
      });
    }

    await advance(ctx, args.userId, "competitiveness");
  },
});

const presetDescriptions: Record<string, string> = {
  cheerleader: "High-energy and celebratory.",
  noNonsense: "Direct and concise coaching.",
  nerd: "Data-forward with science explanations.",
  zen: "Calm and process-focused guidance.",
  custom: "Custom coach voice.",
};

export const savePersonality = mutation({
  args: {
    userId: v.id("users"),
    preset: personalityPresetValidator,
    customDescription: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const isCustom = args.preset === "custom";
    const description = isCustom
      ? args.customDescription?.trim() || "Custom coach voice."
      : (presetDescriptions[args.preset] ?? "Custom coach voice.");

    const existing = await ctx.db
      .query("personalities")
      .withIndex("by_user_id", (query) => query.eq("userId", args.userId))
      .unique();

    const payload = {
      name: args.preset,
      isPreset: !isCustom,
      description,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
    } else {
      await ctx.db.insert("personalities", {
        userId: args.userId,
        ...payload,
      });
    }

    await advance(ctx, args.userId, "personality");
  },
});

export const saveHealthKitAuthorization = mutation({
  args: {
    userId: v.id("users"),
    authorized: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      healthKitAuthorized: args.authorized,
      updatedAt: Date.now(),
    });

    await advance(ctx, args.userId, "healthKitAuthorization");
  },
});
