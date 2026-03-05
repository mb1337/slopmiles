import type { GoalType, VolumeMode } from "./constants";

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
