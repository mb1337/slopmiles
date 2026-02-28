import { v } from "convex/values";
import { mutation } from "./_generated/server";

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

    let runningSchedule = await ctx.db
      .query("runningSchedules")
      .withIndex("by_user_id", (query) => query.eq("userId", user._id))
      .unique();

    if (!runningSchedule) {
      const scheduleId = await ctx.db.insert("runningSchedules", {
        userId: user._id,
        preferredRunningDays: DEFAULT_DAYS,
        runningDaysPerWeek: 5,
        preferredQualityDays: ["tuesday", "thursday"],
        updatedAt: now,
      });
      runningSchedule = await ctx.db.get(scheduleId);
    }

    let onboardingState = await ctx.db
      .query("onboardingStates")
      .withIndex("by_user_id", (query) => query.eq("userId", user._id))
      .unique();

    if (!onboardingState) {
      const stateId = await ctx.db.insert("onboardingStates", {
        userId: user._id,
        currentStep: "welcome",
        isComplete: false,
        updatedAt: now,
      });
      onboardingState = await ctx.db.get(stateId);
    }

    let competitiveness = await ctx.db
      .query("competitiveness")
      .withIndex("by_user_id", (query) => query.eq("userId", user._id))
      .unique();

    if (!competitiveness) {
      const competitivenessId = await ctx.db.insert("competitiveness", {
        userId: user._id,
        level: "balanced",
        updatedAt: now,
      });
      competitiveness = await ctx.db.get(competitivenessId);
    }

    let personality = await ctx.db
      .query("personalities")
      .withIndex("by_user_id", (query) => query.eq("userId", user._id))
      .unique();

    if (!personality) {
      const personalityId = await ctx.db.insert("personalities", {
        userId: user._id,
        name: "noNonsense",
        isPreset: true,
        description: "Brief, direct, no fluff.",
        updatedAt: now,
      });
      personality = await ctx.db.get(personalityId);
    }

    return {
      user,
      runningSchedule,
      onboardingState,
      competitiveness,
      personality,
    };
  },
});
