export const weekdays = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export const onboardingSteps = [
  "welcome",
  "healthKitAuthorization",
  "profileBasics",
  "runningSchedule",
  "trackAccess",
  "establishVDOT",
  "competitiveness",
  "personality",
  "notifications",
  "done",
] as const;

export const unitPreferences = ["system", "metric", "imperial"] as const;
export const volumeModes = ["time", "distance"] as const;
export const competitivenessLevels = ["conservative", "balanced", "aggressive"] as const;
export const personalityPresets = ["cheerleader", "noNonsense", "nerd", "zen", "custom"] as const;
export const goalTypes = ["race", "nonRace", "custom"] as const;
export const planStatuses = ["draft", "active", "completed", "abandoned"] as const;
export const aiCallTypes = ["planGeneration", "weekDetailGeneration"] as const;
export const aiRequestStatuses = ["queued", "inProgress", "succeeded", "failed"] as const;
export const aiRequestPriorities = ["userBlocking", "interactive", "background"] as const;
export const workoutTypes = ["easyRun", "longRun", "tempo", "intervals", "recovery"] as const;
export const workoutVenues = ["track", "road", "any"] as const;
export const workoutOrigins = ["planned", "unplanned"] as const;
export const workoutStatuses = ["planned", "completed", "skipped", "modified"] as const;

export type Weekday = (typeof weekdays)[number];
export type OnboardingStep = (typeof onboardingSteps)[number];
export type GoalType = (typeof goalTypes)[number];
export type PlanStatus = (typeof planStatuses)[number];
export type VolumeMode = (typeof volumeModes)[number];
export type AiCallType = (typeof aiCallTypes)[number];
export type AiRequestStatus = (typeof aiRequestStatuses)[number];
export type AiRequestPriority = (typeof aiRequestPriorities)[number];
export type WorkoutType = (typeof workoutTypes)[number];
export type WorkoutVenue = (typeof workoutVenues)[number];
export type WorkoutOrigin = (typeof workoutOrigins)[number];
export type WorkoutStatus = (typeof workoutStatuses)[number];
