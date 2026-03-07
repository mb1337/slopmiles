import type {
  CompetitivenessLevel,
  OnboardingStep,
  PersonalityPreset,
  TimeWindow,
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
    healthKitAuthorized: boolean;
    currentVDOT?: number | null;
  };
  runningSchedule: {
    preferredRunningDays: Weekday[];
    runningDaysPerWeek: number;
    preferredLongRunDay: Weekday | null;
    preferredQualityDays: Weekday[];
    availabilityWindows?: Partial<Record<Weekday, TimeWindow[]>>;
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

export type HealthKitSyncResult = {
  status: "authorized" | "denied" | "notDetermined" | "unavailable";
  authorized: boolean;
  processedCount: number;
  insertedCount: number;
  updatedCount: number;
  reason?: string;
};

export type Tab = "dashboard" | "plan" | "history" | "coach" | "settings";
