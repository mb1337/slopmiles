import {
  calculatePaceSecondsPerMeter,
  hasMeaningfulGapDifference,
  resolveRepresentativePaceSecondsPerMeterFromVdot,
} from "../packages/domain/src";

export type ComparableWorkoutSegment = {
  order: number;
  label: string;
  paceZone: string;
  targetValue: number;
  targetUnit: "seconds" | "meters";
  repetitions?: number;
};

export type ComparableInterval = {
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  distanceMeters?: number;
  rawPaceSecondsPerMeter?: number;
  gradeAdjustedPaceSecondsPerMeter?: number;
};

export type SegmentRepComparison = {
  repIndex: number;
  plannedSeconds: number | null;
  plannedMeters: number | null;
  plannedPaceSecondsPerMeter: number | null;
  actualSeconds: number | null;
  actualMeters: number | null;
  actualPaceSecondsPerMeter: number | null;
  actualPaceSource: "gap" | "raw" | null;
  paceDeltaPercent: number | null;
  adherenceScore: number;
  inferred: boolean;
};

export type SegmentComparison = {
  plannedSegmentOrder: number;
  plannedLabel: string;
  plannedPaceZone: string | null;
  plannedTargetVolume: number | null;
  plannedVolumeUnit: "seconds" | "meters";
  actualTargetVolume: number | null;
  actualVolumeUnit: "seconds" | "meters";
  adherenceScore: number;
  inferred: boolean;
  reps: SegmentRepComparison[];
};

type PlannedRepSlot = {
  segmentIndex: number;
  repIndex: number;
  segment: ComparableWorkoutSegment;
};

export function buildStructuredSegmentComparisons(args: {
  segments: readonly ComparableWorkoutSegment[];
  intervals: readonly ComparableInterval[];
  vdotAtGeneration: number | null | undefined;
}): SegmentComparison[] {
  const repeatedSegments = args.segments
    .filter((segment) => typeof segment.repetitions === "number" && segment.repetitions > 0)
    .sort((left, right) => left.order - right.order);

  if (repeatedSegments.length === 0) {
    return [];
  }

  const comparisons: SegmentComparison[] = repeatedSegments.map((segment) => ({
    plannedSegmentOrder: segment.order,
    plannedLabel: segment.label,
    plannedPaceZone: segment.paceZone || null,
    plannedTargetVolume: segment.targetValue,
    plannedVolumeUnit: segment.targetUnit,
    actualTargetVolume: null,
    actualVolumeUnit: segment.targetUnit,
    adherenceScore: 0,
    inferred: false,
    reps: [] as SegmentRepComparison[],
  }));

  const plannedRepSlots = repeatedSegments.flatMap((segment, segmentIndex) =>
    Array.from({ length: segment.repetitions ?? 0 }, (_, index) => ({
      segmentIndex,
      repIndex: index + 1,
      segment,
    })),
  );
  const actualIntervals = [...args.intervals].sort((left, right) => {
    if (left.startedAt !== right.startedAt) {
      return left.startedAt - right.startedAt;
    }
    return left.endedAt - right.endedAt;
  });

  const pairedCount = Math.max(plannedRepSlots.length, actualIntervals.length);
  for (let index = 0; index < pairedCount; index += 1) {
    const planned = plannedRepSlots[index] ?? null;
    const interval = actualIntervals[index] ?? null;
    const comparison = buildRepComparison(
      planned?.segment ?? null,
      planned?.repIndex ?? index + 1,
      interval,
      args.vdotAtGeneration,
    );

    if (planned) {
      comparisons[planned.segmentIndex]!.reps.push(comparison);
      continue;
    }

    const fallbackComparison = comparisons[comparisons.length - 1];
    if (fallbackComparison) {
      fallbackComparison.reps.push({
        ...comparison,
        inferred: true,
      });
    }
  }

  for (const comparison of comparisons) {
    const actualVolumes = comparison.reps
      .map((rep) => (comparison.actualVolumeUnit === "seconds" ? rep.actualSeconds : rep.actualMeters))
      .filter((value): value is number => typeof value === "number");
    comparison.actualTargetVolume =
      actualVolumes.length > 0 ? actualVolumes.reduce((sum, value) => sum + value, 0) : null;
    comparison.inferred = comparison.reps.some((rep) => rep.inferred);
    comparison.adherenceScore = comparison.reps.length > 0 ? average(comparison.reps.map((rep) => rep.adherenceScore)) : 0;
  }

  return comparisons;
}

export function resolvePlannedPaceSecondsPerMeter(
  vdotAtGeneration: number | null | undefined,
  paceZone: string,
): number | null {
  return resolveRepresentativePaceSecondsPerMeterFromVdot(vdotAtGeneration, paceZone);
}

export function resolveActualPaceMetrics(args: {
  rawPaceSecondsPerMeter?: number;
  gradeAdjustedPaceSecondsPerMeter?: number;
}): {
  rawPaceSecondsPerMeter: number | null;
  gradeAdjustedPaceSecondsPerMeter: number | null;
  preferredPaceSecondsPerMeter: number | null;
  preferredPaceSource: "gap" | "raw" | null;
  hasMeaningfulGapDifference: boolean;
} {
  const rawPaceSecondsPerMeter =
    typeof args.rawPaceSecondsPerMeter === "number" && args.rawPaceSecondsPerMeter > 0 ? args.rawPaceSecondsPerMeter : null;
  const gradeAdjustedPaceSecondsPerMeter =
    typeof args.gradeAdjustedPaceSecondsPerMeter === "number" && args.gradeAdjustedPaceSecondsPerMeter > 0
      ? args.gradeAdjustedPaceSecondsPerMeter
      : null;

  if (gradeAdjustedPaceSecondsPerMeter !== null) {
    return {
      rawPaceSecondsPerMeter,
      gradeAdjustedPaceSecondsPerMeter,
      preferredPaceSecondsPerMeter: gradeAdjustedPaceSecondsPerMeter,
      preferredPaceSource: "gap",
      hasMeaningfulGapDifference: hasMeaningfulGapDifference(rawPaceSecondsPerMeter ?? undefined, gradeAdjustedPaceSecondsPerMeter),
    };
  }

  return {
    rawPaceSecondsPerMeter,
    gradeAdjustedPaceSecondsPerMeter,
    preferredPaceSecondsPerMeter: rawPaceSecondsPerMeter,
    preferredPaceSource: rawPaceSecondsPerMeter === null ? null : "raw",
    hasMeaningfulGapDifference: false,
  };
}

function buildRepComparison(
  segment: ComparableWorkoutSegment | null,
  repIndex: number,
  interval: ComparableInterval | null,
  vdotAtGeneration: number | null | undefined,
): SegmentRepComparison {
  const plannedPaceSecondsPerMeter = segment
    ? resolvePlannedPaceSecondsPerMeter(vdotAtGeneration, segment.paceZone)
    : null;
  const paceMetrics = resolveActualPaceMetrics({
    rawPaceSecondsPerMeter: interval?.rawPaceSecondsPerMeter,
    gradeAdjustedPaceSecondsPerMeter: interval?.gradeAdjustedPaceSecondsPerMeter,
  });
  const actualMeters =
    interval?.distanceMeters ??
    (interval && paceMetrics.rawPaceSecondsPerMeter
      ? interval.durationSeconds / paceMetrics.rawPaceSecondsPerMeter
      : null);
  const actualSeconds = interval?.durationSeconds ?? null;
  const actualPaceSecondsPerMeter = paceMetrics.preferredPaceSecondsPerMeter;
  const paceDeltaPercent =
    plannedPaceSecondsPerMeter && actualPaceSecondsPerMeter
      ? (actualPaceSecondsPerMeter - plannedPaceSecondsPerMeter) / plannedPaceSecondsPerMeter
      : null;

  const plannedSeconds = segment?.targetUnit === "seconds" ? segment.targetValue : null;
  const plannedMeters = segment?.targetUnit === "meters" ? segment.targetValue : null;
  const adherenceScore = resolveRepAdherenceScore({
    plannedSeconds,
    plannedMeters,
    plannedPaceSecondsPerMeter,
    actualSeconds,
    actualMeters,
    actualPaceSecondsPerMeter,
  });

  return {
    repIndex,
    plannedSeconds,
    plannedMeters,
    plannedPaceSecondsPerMeter,
    actualSeconds,
    actualMeters,
    actualPaceSecondsPerMeter,
    actualPaceSource: paceMetrics.preferredPaceSource,
    paceDeltaPercent,
    adherenceScore,
    inferred: segment === null || interval === null,
  };
}

function resolveRepAdherenceScore(args: {
  plannedSeconds: number | null;
  plannedMeters: number | null;
  plannedPaceSecondsPerMeter: number | null;
  actualSeconds: number | null;
  actualMeters: number | null;
  actualPaceSecondsPerMeter: number | null;
}): number {
  const volumeScore = resolveRatioScore(
    args.plannedSeconds ?? args.plannedMeters,
    args.actualSeconds ?? args.actualMeters,
  );

  if (args.plannedPaceSecondsPerMeter === null || args.actualPaceSecondsPerMeter === null) {
    return volumeScore;
  }

  const paceDelta = Math.abs(args.actualPaceSecondsPerMeter - args.plannedPaceSecondsPerMeter) / args.plannedPaceSecondsPerMeter;
  const paceScore = Math.max(0, 1 - paceDelta / 0.2);
  return roundScore(volumeScore * 0.4 + paceScore * 0.6);
}

function resolveRatioScore(planned: number | null, actual: number | null): number {
  if (planned === null || actual === null || planned <= 0 || actual <= 0) {
    return 0;
  }

  return roundScore(Math.min(planned, actual) / Math.max(planned, actual));
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return roundScore(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function resolveWorkoutRawPaceFromTotals(durationSeconds: number, distanceMeters: number | undefined): number | null {
  return calculatePaceSecondsPerMeter(durationSeconds, distanceMeters) ?? null;
}
