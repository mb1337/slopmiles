import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

import {
  aiCallTypes,
  aiRequestPriorities,
  aiRequestStatuses,
  competitivenessLevels,
  goalTypes,
  onboardingSteps,
  planStatuses,
  personalityPresets,
  unitPreferences,
  volumeModes,
  weekdays,
  workoutOrigins,
  workoutMatchMethods,
  workoutMatchStatuses,
  workoutCheckInStatuses,
  workoutFeedbackStatuses,
  workoutStatuses,
  workoutTypes,
  workoutVenues,
  effortModifiers,
} from "./constants";

const weekdayValidator = v.union(...weekdays.map((day) => v.literal(day)));
const onboardingStepValidator = v.union(...onboardingSteps.map((step) => v.literal(step)));
const unitPreferenceValidator = v.union(...unitPreferences.map((unit) => v.literal(unit)));
const volumeModeValidator = v.union(...volumeModes.map((mode) => v.literal(mode)));
const competitivenessValidator = v.union(...competitivenessLevels.map((level) => v.literal(level)));
const personalityPresetValidator = v.union(...personalityPresets.map((preset) => v.literal(preset)));
const goalTypeValidator = v.union(...goalTypes.map((goalType) => v.literal(goalType)));
const planStatusValidator = v.union(...planStatuses.map((status) => v.literal(status)));
const aiCallTypeValidator = v.union(...aiCallTypes.map((callType) => v.literal(callType)));
const aiRequestStatusValidator = v.union(...aiRequestStatuses.map((status) => v.literal(status)));
const aiRequestPriorityValidator = v.union(...aiRequestPriorities.map((priority) => v.literal(priority)));
const coachMessageAuthorValidator = v.union(v.literal("coach"), v.literal("user"));
const coachMessageKindValidator = v.union(v.literal("message"), v.literal("event"));
const healthKitIntervalTypeValidator = v.union(v.literal("lap"), v.literal("segment"));
const workoutTypeValidator = v.union(...workoutTypes.map((type) => v.literal(type)));
const workoutVenueValidator = v.union(...workoutVenues.map((venue) => v.literal(venue)));
const workoutOriginValidator = v.union(...workoutOrigins.map((origin) => v.literal(origin)));
const workoutStatusValidator = v.union(...workoutStatuses.map((status) => v.literal(status)));
const workoutMatchStatusValidator = v.union(...workoutMatchStatuses.map((status) => v.literal(status)));
const workoutMatchMethodValidator = v.union(...workoutMatchMethods.map((method) => v.literal(method)));
const workoutCheckInStatusValidator = v.union(...workoutCheckInStatuses.map((status) => v.literal(status)));
const workoutFeedbackStatusValidator = v.union(...workoutFeedbackStatuses.map((status) => v.literal(status)));
const effortModifierValidator = v.union(...effortModifiers.map((modifier) => v.literal(modifier)));
const workoutSegmentValidator = v.object({
  order: v.number(),
  label: v.string(),
  paceZone: v.string(),
  targetValue: v.number(),
  targetUnit: v.union(v.literal("seconds"), v.literal("meters")),
  repetitions: v.optional(v.number()),
  restValue: v.optional(v.number()),
  restUnit: v.optional(v.union(v.literal("seconds"), v.literal("meters"))),
});
const healthKitIntervalValidator = v.object({
  type: healthKitIntervalTypeValidator,
  startedAt: v.number(),
  endedAt: v.number(),
  durationSeconds: v.number(),
  distanceMeters: v.optional(v.number()),
  rawPaceSecondsPerMeter: v.optional(v.number()),
  gradeAdjustedPaceSecondsPerMeter: v.optional(v.number()),
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
  ...authTables,

  users: defineTable({
    appleSubject: v.optional(v.string()),
    appleDefaultName: v.optional(v.string()),
    name: v.string(),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    unitPreference: unitPreferenceValidator,
    volumePreference: volumeModeValidator,
    trackAccess: v.boolean(),
    healthKitAuthorized: v.boolean(),
    currentVDOT: v.optional(v.number()),
    maxHeartRate: v.optional(v.number()),
    restingHeartRate: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_apple_subject", ["appleSubject"]),

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
    startDateKey: v.optional(v.string()),
    canonicalTimeZoneId: v.optional(v.string()),
    activatedAt: v.optional(v.number()),
    numberOfWeeks: v.number(),
    volumeMode: volumeModeValidator,
    peakWeekVolume: v.number(),
    weeklyVolumeProfile: v.optional(
      v.array(
        v.object({
          weekNumber: v.number(),
          percentOfPeak: v.number(),
        }),
      ),
    ),
    weeklyEmphasis: v.optional(
      v.array(
        v.object({
          weekNumber: v.number(),
          emphasis: v.string(),
        }),
      ),
    ),
    generationRationale: v.optional(v.string()),
    generatedByAiRequestId: v.optional(v.id("aiRequests")),
    status: planStatusValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_id", ["userId"])
    .index("by_user_id_status", ["userId", "status"]),

  trainingWeeks: defineTable({
    planId: v.id("trainingPlans"),
    weekNumber: v.number(),
    weekStartDateKey: v.string(),
    weekEndDateKey: v.string(),
    targetVolumePercent: v.number(),
    targetVolumeAbsolute: v.number(),
    emphasis: v.string(),
    coachNotes: v.optional(v.string()),
    generated: v.boolean(),
    generatedByAiRequestId: v.optional(v.id("aiRequests")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_plan_id", ["planId"])
    .index("by_plan_id_week_number", ["planId", "weekNumber"]),

  workouts: defineTable({
    weekId: v.id("trainingWeeks"),
    type: workoutTypeValidator,
    volumePercent: v.number(),
    absoluteVolume: v.number(),
    scheduledDateKey: v.string(),
    notes: v.optional(v.string()),
    venue: workoutVenueValidator,
    origin: workoutOriginValidator,
    status: workoutStatusValidator,
    segments: v.array(workoutSegmentValidator),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_week_id", ["weekId"])
    .index("by_week_id_scheduled_date_key", ["weekId", "scheduledDateKey"]),

  aiRequests: defineTable({
    userId: v.id("users"),
    callType: aiCallTypeValidator,
    status: aiRequestStatusValidator,
    priority: aiRequestPriorityValidator,
    dedupeKey: v.string(),
    input: v.any(),
    result: v.optional(v.any()),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    attemptCount: v.number(),
    maxAttempts: v.number(),
    nextRetryAt: v.optional(v.number()),
    promptRevision: v.string(),
    schemaRevision: v.string(),
    lastAttemptAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    consumedByPlanId: v.optional(v.id("trainingPlans")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_id", ["userId"])
    .index("by_user_id_status", ["userId", "status"])
    .index("by_status_next_retry_at", ["status", "nextRetryAt"])
    .index("by_user_id_call_type_dedupe_key", ["userId", "callType", "dedupeKey"]),

  aiDiagnostics: defineTable({
    userId: v.id("users"),
    requestId: v.id("aiRequests"),
    callType: aiCallTypeValidator,
    code: v.string(),
    message: v.string(),
    details: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_user_id", ["userId"])
    .index("by_request_id", ["requestId"]),

  coachMessages: defineTable({
    userId: v.id("users"),
    author: coachMessageAuthorValidator,
    kind: coachMessageKindValidator,
    body: v.string(),
    planId: v.optional(v.id("trainingPlans")),
    relatedRequestId: v.optional(v.id("aiRequests")),
    createdAt: v.number(),
  })
    .index("by_user_id", ["userId"])
    .index("by_user_id_created_at", ["userId", "createdAt"]),

  healthKitWorkouts: defineTable({
    userId: v.id("users"),
    externalWorkoutId: v.string(),
    startedAt: v.number(),
    endedAt: v.number(),
    durationSeconds: v.number(),
    distanceMeters: v.optional(v.number()),
    rawPaceSecondsPerMeter: v.optional(v.number()),
    gradeAdjustedPaceSecondsPerMeter: v.optional(v.number()),
    elevationAscentMeters: v.optional(v.number()),
    elevationDescentMeters: v.optional(v.number()),
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

  workoutExecutions: defineTable({
    userId: v.id("users"),
    healthKitWorkoutId: v.id("healthKitWorkouts"),
    planId: v.optional(v.id("trainingPlans")),
    weekId: v.optional(v.id("trainingWeeks")),
    plannedWorkoutId: v.optional(v.id("workouts")),
    matchStatus: workoutMatchStatusValidator,
    matchMethod: workoutMatchMethodValidator,
    matchConfidence: v.optional(v.number()),
    matchDateKey: v.optional(v.string()),
    checkInStatus: workoutCheckInStatusValidator,
    rpe: v.optional(v.number()),
    modifiers: v.array(effortModifierValidator),
    customModifierText: v.optional(v.string()),
    notes: v.optional(v.string()),
    feedbackStatus: workoutFeedbackStatusValidator,
    feedbackCommentary: v.optional(v.string()),
    feedbackAdjustments: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_id", ["userId"])
    .index("by_healthkit_workout_id", ["healthKitWorkoutId"])
    .index("by_planned_workout_id", ["plannedWorkoutId"])
    .index("by_week_id", ["weekId"]),
});
