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
export const aiCallTypes = ["planGeneration"] as const;
export const aiRequestStatuses = ["queued", "inProgress", "succeeded", "failed"] as const;
export const aiRequestPriorities = ["userBlocking", "interactive", "background"] as const;

export type Weekday = (typeof weekdays)[number];
export type OnboardingStep = (typeof onboardingSteps)[number];
export type GoalType = (typeof goalTypes)[number];
export type PlanStatus = (typeof planStatuses)[number];
export type VolumeMode = (typeof volumeModes)[number];
export type AiCallType = (typeof aiCallTypes)[number];
export type AiRequestStatus = (typeof aiRequestStatuses)[number];
export type AiRequestPriority = (typeof aiRequestPriorities)[number];
