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

export const STRENGTH_EQUIPMENT_OPTIONS = [
  "bodyweight",
  "dumbbells",
  "kettlebells",
  "bands",
  "fullGym",
] as const;
export type StrengthEquipment = (typeof STRENGTH_EQUIPMENT_OPTIONS)[number];

export const DISTANCE_UNITS = ["meters", "kilometers", "miles"] as const;
export type DistanceUnit = (typeof DISTANCE_UNITS)[number];

export const SURFACE_TYPES = ["road", "track", "trail", "treadmill", "mixed"] as const;
export type SurfaceType = (typeof SURFACE_TYPES)[number];

export const GOAL_TYPES = ["race", "nonRace", "custom"] as const;
export type GoalType = (typeof GOAL_TYPES)[number];

export const PLAN_STATUSES = ["draft", "active", "completed", "abandoned"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const PLAN_INTERRUPTION_TYPES = ["injury", "illness", "life", "travel"] as const;
export type PlanInterruptionType = (typeof PLAN_INTERRUPTION_TYPES)[number];

export const WORKOUT_TYPES = ["easyRun", "runWalk", "longRun", "tempo", "intervals"] as const;
export type WorkoutType = (typeof WORKOUT_TYPES)[number];

export const WORKOUT_VENUES = ["track", "road", "any"] as const;
export type WorkoutVenue = (typeof WORKOUT_VENUES)[number];

export const WORKOUT_ORIGINS = ["planned", "unplanned"] as const;
export type WorkoutOrigin = (typeof WORKOUT_ORIGINS)[number];

export const WORKOUT_STATUSES = ["planned", "completed", "skipped", "modified"] as const;
export type WorkoutStatus = (typeof WORKOUT_STATUSES)[number];

export const WORKOUT_MATCH_STATUSES = ["matched", "unmatched", "needsReview"] as const;
export type WorkoutMatchStatus = (typeof WORKOUT_MATCH_STATUSES)[number];

export const WORKOUT_MATCH_METHODS = ["auto", "manual", "none"] as const;
export type WorkoutMatchMethod = (typeof WORKOUT_MATCH_METHODS)[number];

export const WORKOUT_CHECKIN_STATUSES = ["pending", "submitted"] as const;
export type WorkoutCheckInStatus = (typeof WORKOUT_CHECKIN_STATUSES)[number];

export const WORKOUT_FEEDBACK_STATUSES = ["pending", "ready"] as const;
export type WorkoutFeedbackStatus = (typeof WORKOUT_FEEDBACK_STATUSES)[number];

export const STRENGTH_WORKOUT_STATUSES = ["planned", "completed"] as const;
export type StrengthWorkoutStatus = (typeof STRENGTH_WORKOUT_STATUSES)[number];

export const EFFORT_MODIFIERS = [
  "pushedStroller",
  "ranWithDog",
  "trailOffRoad",
  "treadmill",
  "highAltitude",
  "poorSleep",
  "feelingUnwell",
] as const;
export type EffortModifier = (typeof EFFORT_MODIFIERS)[number];

export type WorkoutSegment = {
  order: number;
  label: string;
  paceZone: string;
  targetValue: number;
  targetUnit: "seconds" | "meters";
  repetitions?: number;
  restValue?: number;
  restUnit?: "seconds" | "meters";
};

export type WorkoutFeedbackSummary = {
  status: WorkoutFeedbackStatus;
  commentary?: string;
  adjustments: string[];
};

export type WorkoutExecutionSummary = {
  id: string;
  healthKitWorkoutId: string;
  plannedWorkoutId?: string | null;
  matchStatus: WorkoutMatchStatus;
  matchMethod: WorkoutMatchMethod;
  matchConfidence?: number | null;
  checkInStatus: WorkoutCheckInStatus;
  actualStartedAt: number;
  actualEndedAt: number;
  actualDurationSeconds: number;
  actualDistanceMeters?: number;
  actualRawPaceSecondsPerMeter?: number | null;
  actualGradeAdjustedPaceSecondsPerMeter?: number | null;
  elevationAscentMeters?: number | null;
  elevationDescentMeters?: number | null;
  actualAverageHeartRate?: number;
  rpe?: number | null;
  modifiers: EffortModifier[];
  customModifierText?: string;
  notes?: string;
  feedback: WorkoutFeedbackSummary;
};

export type WorkoutSummary = {
  id: string;
  weekId: string;
  type: WorkoutType;
  volumePercent: number;
  scheduledDateKey: string;
  absoluteVolume: number;
  venue: WorkoutVenue;
  origin: WorkoutOrigin;
  status: WorkoutStatus;
  notes?: string;
  segments: WorkoutSegment[];
  execution?: WorkoutExecutionSummary | null;
};

export type TrainingWeekSummary = {
  id: string;
  weekNumber: number;
  weekStartDateKey: string;
  weekEndDateKey: string;
  targetVolumePercent: number;
  targetVolumeAbsolute: number;
  emphasis: string;
  coachNotes?: string;
  generated: boolean;
  generatedByAiRequestId?: string;
};

export type TrainingWeekDetail = TrainingWeekSummary & {
  workouts: WorkoutSummary[];
};

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

export type StrengthPreference = {
  enabled: boolean;
  equipment: StrengthEquipment[];
};

export type OnboardingState = {
  currentStep: OnboardingStep;
  isComplete: boolean;
};

export type WeekAvailabilityOverride = {
  preferredRunningDays?: Weekday[];
  availabilityWindows?: Partial<Record<Weekday, TimeWindow[]>>;
  note?: string;
};

export type Course = {
  id: string;
  name: string;
  distanceMeters: number;
  distanceUnit: DistanceUnit;
  surface: SurfaceType;
  notes?: string;
};

export type RaceResult = {
  id: string;
  label: string;
  plannedDate: number;
  distanceMeters: number;
  goalTimeSeconds?: number;
  actualTimeSeconds?: number;
  isPrimaryGoal: boolean;
  planId?: string | null;
};

export type PeakVolumeChange = {
  id: string;
  planId: string;
  previousPeakWeekVolume: number;
  newPeakWeekVolume: number;
  reason: string;
  createdAt: number;
};

export type GoalChange = {
  id: string;
  planId: string;
  previousGoalLabel: string;
  newGoalLabel: string;
  reason?: string;
  createdAt: number;
};

export type AssessmentSummary = {
  id: string;
  planId: string;
  summary: string;
  volumeAdherence: number;
  paceAdherence: number;
  vdotStart: number;
  vdotEnd: number;
  highlights: string[];
  areasForImprovement: string[];
  nextPlanSuggestion: string;
  discussionPrompts: string[];
  createdAt: number;
};

export type StrengthWorkoutSummary = {
  id: string;
  weekId: string;
  title: string;
  plannedMinutes: number;
  exercises: Array<{
    name: string;
    sets: number;
    reps?: number;
    holdSeconds?: number;
    restSeconds?: number;
    equipment?: StrengthEquipment | null;
    cues?: string;
  }>;
  status: StrengthWorkoutStatus;
};

export type ExportPackage = {
  exportedAt: number;
  profile: UserProfile;
  runningSchedule: RunningSchedule | null;
  competitiveness: CompetitivenessLevel;
  personality: Personality;
  strengthPreference: StrengthPreference;
  plans: unknown[];
  workouts: unknown[];
  races: RaceResult[];
  courses: Course[];
  assessments: AssessmentSummary[];
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

export * from "./calendar";
export * from "./display";
export * from "./gap";
export * from "./vdot";
