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

export type Weekday = (typeof weekdays)[number];
export type OnboardingStep = (typeof onboardingSteps)[number];
