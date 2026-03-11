import {
  COMPETITIVENESS_LEVELS as competitivenessLevels,
  DISTANCE_UNITS as distanceUnits,
  EFFORT_MODIFIERS as effortModifiers,
  GOAL_TYPES as goalTypes,
  ONBOARDING_STEPS as onboardingSteps,
  PERSONALITY_PRESETS as personalityPresets,
  PLAN_INTERRUPTION_TYPES as planInterruptionTypes,
  PLAN_STATUSES as planStatuses,
  STRENGTH_EQUIPMENT_OPTIONS as strengthEquipmentOptions,
  STRENGTH_WORKOUT_STATUSES as strengthWorkoutStatuses,
  SURFACE_TYPES as surfaceTypes,
  UNIT_PREFERENCES as unitPreferences,
  VOLUME_MODES as volumeModes,
  WEEKDAYS as weekdays,
  WORKOUT_CHECKIN_STATUSES as workoutCheckInStatuses,
  WORKOUT_FEEDBACK_STATUSES as workoutFeedbackStatuses,
  WORKOUT_MATCH_METHODS as workoutMatchMethods,
  WORKOUT_MATCH_STATUSES as workoutMatchStatuses,
  WORKOUT_ORIGINS as workoutOrigins,
  WORKOUT_STATUSES as workoutStatuses,
  WORKOUT_TYPES as workoutTypes,
  WORKOUT_VENUES as workoutVenues,
} from "../packages/domain/src";

export {
  competitivenessLevels,
  distanceUnits,
  effortModifiers,
  goalTypes,
  onboardingSteps,
  personalityPresets,
  planInterruptionTypes,
  planStatuses,
  strengthEquipmentOptions,
  strengthWorkoutStatuses,
  surfaceTypes,
  unitPreferences,
  volumeModes,
  weekdays,
  workoutCheckInStatuses,
  workoutFeedbackStatuses,
  workoutMatchMethods,
  workoutMatchStatuses,
  workoutOrigins,
  workoutStatuses,
  workoutTypes,
  workoutVenues,
};

export const aiCallTypes = ["planGeneration", "weekDetailGeneration", "planAssessment"] as const;
export const aiRequestStatuses = ["queued", "inProgress", "succeeded", "failed"] as const;
export const aiRequestPriorities = ["userBlocking", "interactive", "background"] as const;
export const healthKitSyncSources = ["manual", "background"] as const;

export type Weekday = (typeof weekdays)[number];
export type OnboardingStep = (typeof onboardingSteps)[number];
export type GoalType = (typeof goalTypes)[number];
export type PlanStatus = (typeof planStatuses)[number];
export type VolumeMode = (typeof volumeModes)[number];
export type StrengthEquipment = (typeof strengthEquipmentOptions)[number];
export type AiCallType = (typeof aiCallTypes)[number];
export type AiRequestStatus = (typeof aiRequestStatuses)[number];
export type AiRequestPriority = (typeof aiRequestPriorities)[number];
export type HealthKitSyncSource = (typeof healthKitSyncSources)[number];
export type WorkoutType = (typeof workoutTypes)[number];
export type WorkoutVenue = (typeof workoutVenues)[number];
export type WorkoutOrigin = (typeof workoutOrigins)[number];
export type WorkoutStatus = (typeof workoutStatuses)[number];
export type WorkoutMatchStatus = (typeof workoutMatchStatuses)[number];
export type WorkoutMatchMethod = (typeof workoutMatchMethods)[number];
export type WorkoutCheckInStatus = (typeof workoutCheckInStatuses)[number];
export type WorkoutFeedbackStatus = (typeof workoutFeedbackStatuses)[number];
export type SurfaceType = (typeof surfaceTypes)[number];
export type DistanceUnit = (typeof distanceUnits)[number];
export type StrengthWorkoutStatus = (typeof strengthWorkoutStatuses)[number];
export type PlanInterruptionType = (typeof planInterruptionTypes)[number];
export type EffortModifier = (typeof effortModifiers)[number];
