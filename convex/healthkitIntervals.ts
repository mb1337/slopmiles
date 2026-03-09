type ImportedInterval = {
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  distanceMeters?: number;
  rawPaceSecondsPerMeter?: number;
  gradeAdjustedPaceSecondsPerMeter?: number;
  equivalentFlatDistanceMeters?: number;
  elevationAscentMeters?: number;
  elevationDescentMeters?: number;
  averageHeartRate?: number;
};

type ImportedWorkoutIntervalSource = {
  intervals?: ImportedInterval[] | null;
};

function sortIntervals(intervals: readonly ImportedInterval[]): ImportedInterval[] {
  return [...intervals].sort((left, right) => {
    if (left.startedAt !== right.startedAt) {
      return left.startedAt - right.startedAt;
    }

    if (left.endedAt !== right.endedAt) {
      return left.endedAt - right.endedAt;
    }

    return left.durationSeconds - right.durationSeconds;
  });
}

export function normalizeImportedWorkoutIntervals(workout: ImportedWorkoutIntervalSource): ImportedInterval[] {
  if (!Array.isArray(workout.intervals) || workout.intervals.length === 0) {
    return [];
  }

  return sortIntervals(workout.intervals);
}

export function hasImportedWorkoutIntervals(workout: ImportedWorkoutIntervalSource): boolean {
  return normalizeImportedWorkoutIntervals(workout).length > 0;
}
