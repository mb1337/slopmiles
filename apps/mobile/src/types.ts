import type {
  CompetitivenessLevel,
  OnboardingStep,
  PersonalityPreset,
  UnitPreference,
  VolumeMode,
  Weekday,
} from "@slopmiles/domain";

import type { Id } from "./convex";

export type SessionPayload = {
  user: {
    _id: Id<"users">;
    name: string;
    unitPreference: UnitPreference;
    volumePreference: VolumeMode;
    trackAccess: boolean;
  };
  runningSchedule: {
    preferredRunningDays: Weekday[];
    runningDaysPerWeek: number;
    preferredLongRunDay: Weekday | null;
    preferredQualityDays: Weekday[];
  };
  onboardingState: {
    currentStep: OnboardingStep;
    isComplete: boolean;
  };
  competitiveness: {
    level: CompetitivenessLevel;
  };
  personality: {
    name: PersonalityPreset;
    description: string;
    isPreset: boolean;
  };
};

export type Tab = "dashboard" | "plan" | "history" | "coach" | "settings";
