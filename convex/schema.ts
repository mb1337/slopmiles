import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import {
  competitivenessLevels,
  onboardingSteps,
  personalityPresets,
  unitPreferences,
  volumeModes,
  weekdays,
} from "./constants";

const weekdayValidator = v.union(...weekdays.map((day) => v.literal(day)));
const onboardingStepValidator = v.union(...onboardingSteps.map((step) => v.literal(step)));
const unitPreferenceValidator = v.union(...unitPreferences.map((unit) => v.literal(unit)));
const volumeModeValidator = v.union(...volumeModes.map((mode) => v.literal(mode)));
const competitivenessValidator = v.union(...competitivenessLevels.map((level) => v.literal(level)));
const personalityPresetValidator = v.union(...personalityPresets.map((preset) => v.literal(preset)));

export default defineSchema({
  users: defineTable({
    anonymousHandle: v.string(),
    name: v.string(),
    unitPreference: unitPreferenceValidator,
    volumePreference: volumeModeValidator,
    trackAccess: v.boolean(),
    healthKitAuthorized: v.boolean(),
    currentVDOT: v.optional(v.number()),
    maxHeartRate: v.optional(v.number()),
    restingHeartRate: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_anonymous_handle", ["anonymousHandle"]),

  runningSchedules: defineTable({
    userId: v.id("users"),
    preferredRunningDays: v.array(weekdayValidator),
    runningDaysPerWeek: v.number(),
    preferredLongRunDay: v.optional(weekdayValidator),
    preferredQualityDays: v.array(weekdayValidator),
    availabilityWindows: v.optional(v.any()),
    updatedAt: v.number(),
  }).index("by_user_id", ["userId"]),

  onboardingStates: defineTable({
    userId: v.id("users"),
    currentStep: onboardingStepValidator,
    isComplete: v.boolean(),
    updatedAt: v.number(),
  }).index("by_user_id", ["userId"]),

  competitiveness: defineTable({
    userId: v.id("users"),
    level: competitivenessValidator,
    updatedAt: v.number(),
  }).index("by_user_id", ["userId"]),

  personalities: defineTable({
    userId: v.id("users"),
    name: personalityPresetValidator,
    isPreset: v.boolean(),
    description: v.string(),
    updatedAt: v.number(),
  }).index("by_user_id", ["userId"]),
});
