export type MarkerBoundedInterval = {
  startedAt: number;
  endedAt: number;
};

export function buildMarkerBoundedIntervals(args: {
  workoutStartedAt: number;
  workoutEndedAt: number;
  markerTimestamps: readonly number[];
}): MarkerBoundedInterval[] {
  const orderedTimestamps = [args.workoutStartedAt, ...args.markerTimestamps, args.workoutEndedAt]
    .filter((timestamp) => Number.isFinite(timestamp))
    .sort((left, right) => left - right);

  const intervals: MarkerBoundedInterval[] = [];

  for (let index = 0; index < orderedTimestamps.length - 1; index += 1) {
    const startedAt = orderedTimestamps[index]!;
    const endedAt = orderedTimestamps[index + 1]!;

    if (endedAt <= startedAt) {
      continue;
    }

    intervals.push({
      startedAt,
      endedAt,
    });
  }

  return intervals;
}
