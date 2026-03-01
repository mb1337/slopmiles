import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
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
import { calculateVdotFromRaceTime } from "../packages/domain/src/vdot";

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

async function requireAuthenticatedUserId(ctx: MutationCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Authentication required.");
  }
  return userId;
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
    step: onboardingStepValidator,
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    await advance(ctx, userId, args.step);
  },
});

export const saveProfileBasics = mutation({
  args: {
    unitPreference: unitPreferenceValidator,
    volumePreference: volumeModeValidator,
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    await ctx.db.patch(userId, {
      unitPreference: args.unitPreference,
      volumePreference: args.volumePreference,
      updatedAt: Date.now(),
    });

    await advance(ctx, userId, "profileBasics");
  },
});

export const saveRunningSchedule = mutation({
  args: {
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

    const userId = await requireAuthenticatedUserId(ctx);

    const schedule = await ctx.db
      .query("runningSchedules")
      .withIndex("by_user_id", (query) => query.eq("userId", userId))
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
        userId,
        ...payload,
      });
    }

    await advance(ctx, userId, "runningSchedule");
  },
});

export const saveTrackAccess = mutation({
  args: {
    trackAccess: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    await ctx.db.patch(userId, {
      trackAccess: args.trackAccess,
      updatedAt: Date.now(),
    });

    await advance(ctx, userId, "trackAccess");
  },
});

export const saveCompetitiveness = mutation({
  args: {
    level: competitivenessValidator,
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const existing = await ctx.db
      .query("competitiveness")
      .withIndex("by_user_id", (query) => query.eq("userId", userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        level: args.level,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("competitiveness", {
        userId,
        level: args.level,
        updatedAt: Date.now(),
      });
    }

    await advance(ctx, userId, "competitiveness");
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
    preset: personalityPresetValidator,
    customDescription: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const isCustom = args.preset === "custom";
    const description = isCustom
      ? args.customDescription?.trim() || "Custom coach voice."
      : (presetDescriptions[args.preset] ?? "Custom coach voice.");

    const existing = await ctx.db
      .query("personalities")
      .withIndex("by_user_id", (query) => query.eq("userId", userId))
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
        userId,
        ...payload,
      });
    }

    await advance(ctx, userId, "personality");
  },
});

export const saveHealthKitAuthorization = mutation({
  args: {
    authorized: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    await ctx.db.patch(userId, {
      healthKitAuthorized: args.authorized,
      updatedAt: Date.now(),
    });

    await advance(ctx, userId, "healthKitAuthorization");
  },
});

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
}

function roundVdot(value: number): number {
  return Math.round(value * 10) / 10;
}

export const saveVdotFromManualResult = mutation({
  args: {
    distanceMeters: v.number(),
    timeSeconds: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    assertPositiveFinite(args.distanceMeters, "distanceMeters");
    assertPositiveFinite(args.timeSeconds, "timeSeconds");

    const vdot = roundVdot(calculateVdotFromRaceTime(args.distanceMeters, args.timeSeconds));

    await ctx.db.patch(userId, {
      currentVDOT: vdot,
      updatedAt: Date.now(),
    });

    await advance(ctx, userId, "establishVDOT");

    return {
      vdot,
    };
  },
});

export const saveVdotFromHistoryWorkout = mutation({
  args: {
    healthKitWorkoutId: v.id("healthKitWorkouts"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const workout = await ctx.db.get(args.healthKitWorkoutId);
    if (!workout || workout.userId !== userId) {
      throw new Error("Workout not found for user.");
    }

    if (typeof workout.distanceMeters !== "number") {
      throw new Error("Selected workout does not include distance.");
    }

    assertPositiveFinite(workout.distanceMeters, "distanceMeters");
    assertPositiveFinite(workout.durationSeconds, "timeSeconds");

    const vdot = roundVdot(calculateVdotFromRaceTime(workout.distanceMeters, workout.durationSeconds));

    await ctx.db.patch(userId, {
      currentVDOT: vdot,
      updatedAt: Date.now(),
    });

    await advance(ctx, userId, "establishVDOT");

    return {
      vdot,
    };
  },
});
