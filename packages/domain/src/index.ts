export const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export const ONBOARDING_STEPS = [
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

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const COMPETITIVENESS_LEVELS = [
  "conservative",
  "balanced",
  "aggressive",
] as const;

export type CompetitivenessLevel = (typeof COMPETITIVENESS_LEVELS)[number];

export const PERSONALITY_PRESETS = [
  "cheerleader",
  "noNonsense",
  "nerd",
  "zen",
  "custom",
] as const;

export type PersonalityPreset = (typeof PERSONALITY_PRESETS)[number];

export const UNIT_PREFERENCES = ["system", "metric", "imperial"] as const;
export type UnitPreference = (typeof UNIT_PREFERENCES)[number];

export const VOLUME_MODES = ["time", "distance"] as const;
export type VolumeMode = (typeof VOLUME_MODES)[number];

export type TimeWindow = {
  start: string;
  end: string;
};

export type RunningSchedule = {
  preferredRunningDays: Weekday[];
  runningDaysPerWeek: number;
  preferredLongRunDay: Weekday | null;
  preferredQualityDays: Weekday[];
  availabilityWindows: Partial<Record<Weekday, TimeWindow[]>>;
};

export type UserProfile = {
  id: string;
  anonymousHandle: string;
  name: string;
  unitPreference: UnitPreference;
  volumePreference: VolumeMode;
  trackAccess: boolean;
  healthKitAuthorized: boolean;
  maxHeartRate: number | null;
  restingHeartRate: number | null;
  currentVDOT: number | null;
};

export type Personality = {
  name: PersonalityPreset;
  isPreset: boolean;
  description: string;
};

export type OnboardingState = {
  currentStep: OnboardingStep;
  isComplete: boolean;
};

export type VolumeResolutionInput =
  | {
      mode: "time";
      peakWeekVolumeMinutes: number;
      percentOfPeak: number;
    }
  | {
      mode: "distance";
      peakWeekVolumeMeters: number;
      percentOfPeak: number;
    };

export function resolvePercentOfPeakAbsoluteValue(input: VolumeResolutionInput): number {
  if (input.mode === "time") {
    return input.peakWeekVolumeMinutes * 60 * input.percentOfPeak;
  }

  return input.peakWeekVolumeMeters * input.percentOfPeak;
}

export function roundPersistedAbsoluteValue(value: number): number {
  return Math.round(value);
}

export function clampPercent(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function normalizeWorkoutPercents(percents: number[], targetWeekPercent: number): number[] {
  const total = percents.reduce((sum, value) => sum + value, 0);
  if (total <= 0 || targetWeekPercent <= 0) {
    return percents.map(() => 0);
  }

  const ratio = targetWeekPercent / total;
  return percents.map((value) => value * ratio);
}

export function nextOnboardingStep(step: OnboardingStep): OnboardingStep {
  const index = ONBOARDING_STEPS.indexOf(step);
  if (index < 0 || index >= ONBOARDING_STEPS.length - 1) {
    return "done";
  }

  return ONBOARDING_STEPS[index + 1] ?? "done";
}
