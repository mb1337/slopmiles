import type { PlanAssessmentStateView } from "./assessment";

export type ComponentEntityId = string;

export type DashboardPendingAction =
  | {
      kind: "createPlan";
      label: string;
      description: string;
    }
  | {
      kind: "activateDraft";
      label: string;
      description: string;
      draftPlanId: ComponentEntityId;
    }
  | {
      kind: "generateWeek";
      label: string;
      description: string;
      weekNumber: number;
    }
  | {
      kind: "submitCheckIn";
      label: string;
      description: string;
      workoutId: ComponentEntityId;
      weekNumber: number;
    }
  | {
      kind: "reviewHistory";
      label: string;
      description: string;
      healthKitWorkoutId: ComponentEntityId;
    }
  | {
      kind: "messageCoach";
      label: string;
      description: string;
    };

export type DashboardView = {
  currentVDOT: number | null;
  latestCoachMessage: {
    id: ComponentEntityId;
    body: string;
    kind: string;
    createdAt: number;
  } | null;
  activePlan: {
    _id: ComponentEntityId;
    label: string;
    numberOfWeeks: number;
    volumeMode: string;
    peakWeekVolume: number;
    currentWeekNumber: number | null;
  } | null;
  nextWorkout: {
    _id: ComponentEntityId;
    weekNumber: number | null;
    scheduledDateKey: string;
    type: string;
    absoluteVolume: number;
    volumePercent: number;
    venue: string;
    status: string;
  } | null;
  weekProgress: {
    weekNumber: number;
    totalWorkouts: number;
    completedWorkouts: number;
    targetVolumeAbsolute: number;
    targetVolumePercent: number;
    emphasis: string;
  } | null;
  pendingActions: DashboardPendingAction[];
  pastPlan: {
    _id: ComponentEntityId;
    status: string;
    label: string;
    createdAt: number;
    assessment: PlanAssessmentStateView;
  } | null;
};
