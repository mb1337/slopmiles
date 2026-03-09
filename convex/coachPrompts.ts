import type { GoalType, VolumeMode } from "./constants";
import type { DateKey } from "../packages/domain/src/calendar";

type TrainingHistoryWorkoutSummary = {
  startedAt: number;
  durationSeconds: number;
  distanceMeters?: number;
  averageHeartRate?: number;
};

export type PlanGenerationPromptInput = {
  goalType: GoalType;
  goalLabel: string;
  targetDate?: number;
  goalTimeSeconds?: number;
  volumeMode: VolumeMode;
  authoritativeNumberOfWeeks?: number;
  requestedNumberOfWeeks?: number;
  includeStrength: boolean;
  strengthEquipment: string[];
  competitiveness: string;
  personalityDescription: string;
  unitPreference: string;
  scheduleConstraints: {
    targetRunningDaysPerWeek: number;
    availableDaysPerWeek: number;
  };
  currentVDOT?: number;
  recentWorkouts: TrainingHistoryWorkoutSummary[];
};

export type WeekDetailGenerationPromptInput = {
  goalLabel: string;
  volumeMode: VolumeMode;
  peakWeekVolume: number;
  currentVDOT?: number;
  competitiveness: string;
  personalityDescription: string;
  preferredRunningDays: string[];
  preferredLongRunDay?: string;
  preferredQualityDays: string[];
  trackAccess: boolean;
  weekNumber: number;
  weekStartDateKey: DateKey;
  weekEndDateKey: DateKey;
  targetVolumePercent: number;
  targetVolumeAbsolute: number;
  emphasis: string;
  recentWorkouts: TrainingHistoryWorkoutSummary[];
  availabilityOverride?: {
    preferredRunningDays?: string[];
    availabilityWindows?: Record<string, Array<{ start: string; end: string }>>;
    note?: string;
  };
  interruption?: {
    type: string;
    note?: string;
  };
  races: Array<{
    label: string;
    plannedDate: number;
    distanceMeters: number;
    goalTimeSeconds?: number;
    isPrimaryGoal: boolean;
  }>;
  includeStrength: boolean;
  strengthEquipment: string[];
  strengthApproach?: string;
  lockedRunningWorkouts: Array<{
    type: string;
    volumePercent: number;
    scheduledDate: DateKey;
    venue: string;
    notes?: string;
  }>;
  volumeTargetMode: "exact" | "upToTarget";
};

const BASE_SYSTEM_PROMPT = [
  "You are SlopMiles, an expert running coach.",
  "Follow core training guardrails: 2-3 quality sessions max per week, long run roughly <=30% of weekly volume, conservative progression with down weeks, and clear hard/easy polarization.",
  "This call is for macro plan structure only. Do not assume or optimize specific weekday placements.",
  "Apply competitiveness to how aggressively you progress training load.",
  "Use personality only for tone, not for weakening training quality.",
  "Return strictly valid JSON. Do not include markdown, prose outside JSON, or comments.",
].join(" ");

export function buildPlanGenerationMessages(input: PlanGenerationPromptInput) {
  const systemPrompt = `${BASE_SYSTEM_PROMPT} Personality voice guidance: ${input.personalityDescription}`;

  const expectedShape = {
    numberOfWeeks: "number",
    peakWeekVolume: "number",
    peakWeekVolumeUnit: "\"minutes\" | \"meters\"",
    weeklyVolumeProfile: {
      "1": "number (0.0-1.0)",
    },
    weeklyEmphasis: {
      "1": "string",
    },
    strengthApproach: "string (optional)",
    rationale: "string",
  };

  const payload = {
    goal: {
      type: input.goalType,
      label: input.goalLabel,
      targetDate: input.targetDate,
      goalTimeSeconds: input.goalTimeSeconds,
    },
    planning: {
      volumeMode: input.volumeMode,
      authoritativeNumberOfWeeks: input.authoritativeNumberOfWeeks,
      requestedNumberOfWeeks: input.requestedNumberOfWeeks,
      includeStrength: input.includeStrength,
      strengthEquipment: input.strengthEquipment,
      unitPreference: input.unitPreference,
      competitiveness: input.competitiveness,
      scheduleConstraints: input.scheduleConstraints,
    },
    runner: {
      currentVDOT: input.currentVDOT,
    },
    recentTrainingSummary: {
      workoutCount: input.recentWorkouts.length,
      workouts: input.recentWorkouts,
    },
    responseRequirements: {
      jsonOnly: true,
      keysRequired: [
        "peakWeekVolume",
        "peakWeekVolumeUnit",
        "weeklyVolumeProfile",
        "weeklyEmphasis",
        "rationale",
      ],
      peakWeekVolumeRule:
        "If volumeMode is time, peakWeekVolume MUST be total minutes for the peak week and peakWeekVolumeUnit must be \"minutes\". If volumeMode is distance, peakWeekVolume MUST be total meters and peakWeekVolumeUnit must be \"meters\".",
      conversionRule:
        "If you reason in hours or kilometers/miles, convert to canonical units before returning JSON.",
      numberOfWeeksRule:
        "If authoritativeNumberOfWeeks is provided, keep numberOfWeeks aligned with that value.",
      weekMapsRule:
        "Provide weeklyVolumeProfile and weeklyEmphasis entries for every week from 1 through numberOfWeeks.",
    },
    expectedShape,
  };

  return [
    {
      role: "system" as const,
      content: systemPrompt,
    },
    {
      role: "user" as const,
      content: JSON.stringify(payload),
    },
  ];
}

const WEEK_DETAIL_SYSTEM_PROMPT = [
  "You are SlopMiles, an expert running coach.",
  "This call is for one training week only.",
  "Respect available running days as hard constraints.",
  "Locked running workouts are already completed or fixed and must remain unchanged.",
  "Use races, interruptions, and schedule overrides to adapt the remaining week.",
  "If strength is enabled, return optional strength workouts for the week.",
  "Use at most two workouts on one day.",
  "Use venue=track only when track access is true.",
  "Return strictly valid JSON. Do not include markdown, prose outside JSON, or comments.",
].join(" ");

export function buildWeekDetailGenerationMessages(input: WeekDetailGenerationPromptInput) {
  const systemPrompt = `${WEEK_DETAIL_SYSTEM_PROMPT} Personality voice guidance: ${input.personalityDescription}`;
  const allowedScheduledDates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${input.weekStartDateKey}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });

  const payload = {
    goal: {
      label: input.goalLabel,
    },
    runner: {
      currentVDOT: input.currentVDOT,
      competitiveness: input.competitiveness,
      trackAccess: input.trackAccess,
    },
    week: {
      weekNumber: input.weekNumber,
      weekStartDateKey: input.weekStartDateKey,
      weekEndDateKey: input.weekEndDateKey,
      targetVolumePercent: input.targetVolumePercent,
      targetVolumeAbsolute: input.targetVolumeAbsolute,
      emphasis: input.emphasis,
      volumeMode: input.volumeMode,
      peakWeekVolume: input.peakWeekVolume,
      allowedScheduledDates,
    },
    schedule: {
      preferredRunningDays: input.preferredRunningDays,
      preferredLongRunDay: input.preferredLongRunDay,
      preferredQualityDays: input.preferredQualityDays,
      availabilityOverride: input.availabilityOverride,
    },
    constraints: {
      interruption: input.interruption,
      races: input.races,
      lockedRunningWorkouts: input.lockedRunningWorkouts,
    },
    strength: {
      includeStrength: input.includeStrength,
      equipment: input.strengthEquipment,
      approach: input.strengthApproach,
    },
    recentTrainingSummary: {
      workoutCount: input.recentWorkouts.length,
      workouts: input.recentWorkouts,
    },
    responseRequirements: {
      jsonOnly: true,
      allowedWorkoutTypes: ["easyRun", "longRun", "tempo", "intervals", "recovery"],
      allowedVenues: input.trackAccess ? ["track", "road", "any"] : ["road", "any"],
      paceZoneRule: 'Use "E", "M", "T", "I", "R", or a race pace label ending with "pace".',
      dateRule: "scheduledDate must be a YYYY-MM-DD date inside the target week.",
      volumeRule:
        input.volumeTargetMode === "exact"
          ? "Generated running workout volumePercent values should fill the remaining weekly target after locked workouts. Return decimals in [0,1]."
          : "Generated running workout volumePercent values should stay at or below the remaining weekly target after locked workouts. Return decimals in [0,1].",
      segmentRule:
        "Use segments with targetUnit of seconds or meters. Optional repetitions, restValue, and restUnit are allowed.",
      raceRule:
        "Races stay separate from workouts. Use them to replace a hard effort or reduce surrounding load, but do not return races as running workouts.",
      coachNotesRule:
        "coachNotes should explain any deviation caused by overrides, interruptions, races, or locked workouts.",
      strengthRule:
        "If strength.includeStrength is true, you may return strengthWorkouts as a separate array of sessions for the week.",
      requiredKeys: ["workouts", "coachNotes"],
    },
    expectedShape: {
      workouts: [
        {
          type: "easyRun | longRun | tempo | intervals | recovery",
          volumePercent: "number",
          scheduledDate: "YYYY-MM-DD",
          venue: "track | road | any",
          notes: "string (optional)",
          segments: [
            {
              label: "string",
              paceZone: "E | M | T | I | R | '<race> pace'",
              targetValue: "number",
              targetUnit: "seconds | meters",
              repetitions: "number (optional)",
              restValue: "number (optional)",
              restUnit: "seconds | meters (optional)",
            },
          ],
        },
      ],
      strengthWorkouts: [
        {
          title: "string",
          plannedMinutes: "number",
          notes: "string (optional)",
          exercises: [
            {
              name: "string",
              sets: "number",
              reps: "number (optional)",
              holdSeconds: "number (optional)",
              restSeconds: "number (optional)",
              equipment: "bodyweight | dumbbells | kettlebells | bands | fullGym (optional)",
              cues: "string (optional)",
            },
          ],
        },
      ],
      coachNotes: "string",
    },
  };

  return [
    {
      role: "system" as const,
      content: systemPrompt,
    },
    {
      role: "user" as const,
      content: JSON.stringify(payload),
    },
  ];
}
