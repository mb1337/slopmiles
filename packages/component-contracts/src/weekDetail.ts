export type WeekDetailView = {
  plan: {
    _id: string;
    goalLabel: string;
    status: string;
    volumeMode: string;
    currentWeekNumber: number | null;
  };
  week: {
    _id: string;
    weekNumber: number;
    weekStartDateKey: string;
    weekEndDateKey: string;
    targetVolumePercent: number;
    targetVolumeAbsolute: number;
    emphasis: string;
    coachNotes?: string;
    generated: boolean;
    interruptionType?: string | null;
    interruptionNote?: string | null;
    availabilityOverride?: {
      preferredRunningDays?: string[];
      availabilityWindows?: Record<string, Array<{ start: string; end: string }>>;
      note?: string;
    } | null;
  };
  canGenerate: boolean;
  latestRequest: {
    _id: string;
    status: string;
    errorMessage?: string;
  } | null;
  workouts: Array<{
    _id: string;
    type: string;
    scheduledDateKey: string;
    absoluteVolume: number;
    status: string;
    execution?: {
      matchStatus?: string;
      checkInStatus?: string;
    } | null;
  }>;
  strengthWorkouts: Array<{
    _id: string;
    title: string;
    plannedMinutes: number;
    notes?: string;
    status: string;
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
};

export type SaveWeekAvailabilityOverrideInput = {
  weekId: string;
  preferredRunningDays?: string[];
  availabilityWindows?: Record<string, Array<{ start: string; end: string }>>;
  note?: string;
};
