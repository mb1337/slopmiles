import type { PlanAssessmentStateView } from "./assessment";

export type PlanOverviewView = {
  activePlan: {
    _id: string;
    status: string;
    numberOfWeeks: number;
    volumeMode: string;
    peakWeekVolume: number;
    goalLabel: string;
    goalType: string;
    targetDate: number | null;
    goalTimeSeconds: number | null;
    currentWeekNumber: number | null;
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
    peakVolumeChanges: Array<{
      _id: string;
      previousPeakWeekVolume: number;
      newPeakWeekVolume: number;
      reason: string;
      createdAt: number;
    }>;
    goalChanges: Array<{
      _id: string;
      reason?: string;
      createdAt: number;
    }>;
    races: Array<{
      _id: string;
      label: string;
      plannedDate: number;
      distanceMeters: number;
      goalTimeSeconds?: number;
      actualTimeSeconds?: number;
      isPrimaryGoal: boolean;
    }>;
    assessment: PlanAssessmentStateView;
  } | null;
  draftPlans: Array<{
    _id: string;
    numberOfWeeks: number;
    volumeMode: string;
    peakWeekVolume: number;
    goalId: string;
    status: string;
  }>;
  pastPlans: Array<{
    _id: string;
    numberOfWeeks: number;
    volumeMode: string;
    peakWeekVolume: number;
    goalId: string;
    status: string;
    goalLabel?: string;
    createdAt: number;
    assessment: PlanAssessmentStateView;
  }>;
  latestProposal: {
    _id: string;
    status: string;
    errorMessage?: string;
    consumedByPlanId?: string | null;
    createdAt: number;
    input: unknown;
    result?: {
      numberOfWeeks: number;
      peakWeekVolume: number;
      weeklyVolumeProfile: Array<{
        weekNumber: number;
        percentOfPeak: number;
      }>;
      weeklyEmphasis: Array<{
        weekNumber: number;
        emphasis: string;
      }>;
      rationale: string;
    };
  } | null;
};

export type UpdatePlanPeakVolumeInput = {
  planId: string;
  peakWeekVolume: number;
  reason: string;
};

export type ChangePlanGoalInput = {
  planId: string;
  goalType: string;
  goalLabel: string;
  targetDate?: number;
  goalTimeSeconds?: number;
  reason?: string;
};

export type ReportPlanInterruptionInput = {
  planId: string;
  type: string;
  note: string;
};
