import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import {
  competitivenessLevels,
  goalTypes,
  onboardingSteps,
  planStatuses,
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
const goalTypeValidator = v.union(...goalTypes.map((goalType) => v.literal(goalType)));
const planStatusValidator = v.union(...planStatuses.map((status) => v.literal(status)));
const healthKitIntervalTypeValidator = v.union(v.literal("lap"), v.literal("segment"));
const healthKitIntervalValidator = v.object({
  type: healthKitIntervalTypeValidator,
  startedAt: v.number(),
  endedAt: v.number(),
  durationSeconds: v.number(),
  distanceMeters: v.optional(v.number()),
  averageHeartRate: v.optional(v.number()),
});
const healthKitIntervalChainValidator = v.object({
  chainIndex: v.number(),
  startedAt: v.number(),
  endedAt: v.number(),
  durationSeconds: v.number(),
  intervalCount: v.number(),
  distanceMeters: v.optional(v.number()),
  intervals: v.array(healthKitIntervalValidator),
});

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

  goals: defineTable({
    userId: v.id("users"),
    type: goalTypeValidator,
    label: v.string(),
    targetDate: v.optional(v.number()),
    goalTimeSeconds: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_user_id", ["userId"]),

  trainingPlans: defineTable({
    userId: v.id("users"),
    goalId: v.id("goals"),
    numberOfWeeks: v.number(),
    volumeMode: volumeModeValidator,
    peakWeekVolume: v.number(),
    status: planStatusValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_id", ["userId"])
    .index("by_user_id_status", ["userId", "status"]),

  healthKitWorkouts: defineTable({
    userId: v.id("users"),
    externalWorkoutId: v.string(),
    startedAt: v.number(),
    endedAt: v.number(),
    durationSeconds: v.number(),
    distanceMeters: v.optional(v.number()),
    averageHeartRate: v.optional(v.number()),
    maxHeartRate: v.optional(v.number()),
    intervalChains: v.optional(v.array(healthKitIntervalChainValidator)),
    sourceName: v.optional(v.string()),
    sourceBundleIdentifier: v.optional(v.string()),
    importedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_id", ["userId"])
    .index("by_user_id_external_workout_id", ["userId", "externalWorkoutId"]),
});
