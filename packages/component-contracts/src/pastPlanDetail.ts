import type { PlanAssessmentStateView } from "./assessment";

export type PastPlanDetailView = {
  plan: {
    _id: string;
    status: string;
    goalLabel: string;
    goalType: string;
    targetDate: number | null;
    goalTimeSeconds: number | null;
    numberOfWeeks: number;
    volumeMode: string;
    peakWeekVolume: number;
    createdAt: number;
  };
  weeks: Array<{
    _id: string;
    weekNumber: number;
    weekStartDateKey: string;
    weekEndDateKey: string;
    targetVolumePercent: number;
    targetVolumeAbsolute: number;
    emphasis: string;
    coachNotes?: string;
    generated: boolean;
    interruptionType: string | null;
  }>;
  assessment: PlanAssessmentStateView;
};
