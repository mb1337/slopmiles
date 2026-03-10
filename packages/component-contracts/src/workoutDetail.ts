export type WorkoutDetailView = {
  plan: {
    _id: string;
    goalLabel: string;
    volumeMode: string;
    peakWeekVolume: number;
    weekNumber: number;
  };
  week: {
    _id: string;
    weekNumber: number;
    weekStartDateKey: string;
    weekEndDateKey: string;
  };
  workout: {
    _id: string;
    type: string;
    volumePercent: number;
    absoluteVolume: number;
    scheduledDateKey: string;
    notes?: string;
    venue: string;
    origin: string;
    status: string;
    segments: Array<{
      label: string;
      paceZone: string;
      targetValue: number;
      targetUnit: "seconds" | "meters";
      repetitions?: number;
      restValue?: number;
      restUnit?: "seconds" | "meters";
    }>;
  };
  executionDetail: unknown;
  primaryAction: "checkIn" | "viewActualRun" | "reschedule" | "reviewExecution";
  rescheduleOptions: string[];
};

export type SkipWorkoutInput = {
  workoutId: string;
  reason?: string;
};

export type RescheduleWorkoutInput = {
  workoutId: string;
  newScheduledDateKey: string;
};
