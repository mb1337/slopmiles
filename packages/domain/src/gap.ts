export type GapRouteLocation = {
  latitude: number;
  longitude: number;
  altitudeMeters: number;
  timestampMs: number;
  distanceFromPreviousMeters?: number;
  horizontalAccuracyMeters?: number;
  verticalAccuracyMeters?: number;
};

export type GapMicroSegment = {
  startedAt: number;
  endedAt: number;
  distanceMeters: number;
  durationSeconds: number;
  rawPaceSecondsPerMeter: number;
  gradeAdjustedPaceSecondsPerMeter: number;
  grade: number;
  elevationGainMeters: number;
  elevationLossMeters: number;
};

export type GapAnalysis = {
  rawPaceSecondsPerMeter: number;
  gradeAdjustedPaceSecondsPerMeter: number;
  elevationAscentMeters: number;
  elevationDescentMeters: number;
  microSegments: GapMicroSegment[];
};

export type GapAnalysisOptions = {
  targetAscentMeters?: number;
  targetDescentMeters?: number;
  forceClosedLoop?: boolean;
};

export type GapIntervalAggregate = {
  distanceMeters: number;
  durationSeconds: number;
  rawPaceSecondsPerMeter: number;
  gradeAdjustedPaceSecondsPerMeter: number;
};

const EARTH_RADIUS_METERS = 6_371_000;
const MIN_POINT_DISTANCE_METERS = 0.5;
const MAX_HORIZONTAL_ACCURACY_METERS = 30;
const MAX_VERTICAL_ACCURACY_METERS = 20;
const TARGET_SEGMENT_DISTANCE_METERS = 100;
const MAX_ABSOLUTE_GRADE = 0.3;
const SMOOTHING_WINDOW_RADIUS = 2;

export function calculatePaceSecondsPerMeter(
  durationSeconds: number,
  distanceMeters: number | undefined,
): number | undefined {
  if (
    typeof distanceMeters !== "number" ||
    !Number.isFinite(distanceMeters) ||
    distanceMeters <= 0 ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  ) {
    return undefined;
  }

  return durationSeconds / distanceMeters;
}

export function calculateMinettiCost(grade: number): number {
  if (!Number.isFinite(grade)) {
    throw new Error("grade must be finite");
  }

  return (
    155.4 * Math.pow(grade, 5) -
    30.4 * Math.pow(grade, 4) -
    43.3 * Math.pow(grade, 3) +
    46.3 * Math.pow(grade, 2) +
    19.5 * grade +
    3.6
  );
}

export function calculateGradeAdjustedPace(
  rawPaceSecondsPerMeter: number,
  grade: number,
): number {
  if (!Number.isFinite(rawPaceSecondsPerMeter) || rawPaceSecondsPerMeter <= 0) {
    throw new Error("rawPaceSecondsPerMeter must be a positive finite number");
  }

  const clampedGrade = clampGrade(grade);
  const costAtGrade = calculateMinettiCost(clampedGrade);
  const costAtFlat = calculateMinettiCost(0);
  if (!Number.isFinite(costAtGrade) || costAtGrade <= 0) {
    throw new Error("grade produced an invalid Minetti cost");
  }

  // Preserve uphill penalty, but do not grant downhill "credit".
  // This keeps rolling routes harder than flat even when ascent and descent balance out.
  const effectiveCost = clampedGrade < 0 ? costAtFlat : costAtGrade;

  return rawPaceSecondsPerMeter * (costAtFlat / effectiveCost);
}

export function analyzeRouteForGap(
  routeLocations: readonly GapRouteLocation[],
  options: GapAnalysisOptions = {},
): GapAnalysis | null {
  const orderedLocations = routeLocations
    .filter(
      (location) =>
        Number.isFinite(location.latitude) &&
        Number.isFinite(location.longitude) &&
        Number.isFinite(location.altitudeMeters) &&
        Number.isFinite(location.timestampMs) &&
        hasUsableAccuracy(location),
    )
    .slice()
    .sort((left, right) => left.timestampMs - right.timestampMs);

  if (orderedLocations.length < 2) {
    return null;
  }

  const cumulativeDistances = buildCumulativeDistances(orderedLocations);

  const smoothedAltitudes = orderedLocations.map((_, index) =>
    median(
      orderedLocations
        .slice(
          Math.max(0, index - SMOOTHING_WINDOW_RADIUS),
          Math.min(orderedLocations.length, index + SMOOTHING_WINDOW_RADIUS + 1),
        )
        .map((location) => location.altitudeMeters),
    ),
  );
  const correctedAltitudes = correctAltitudeDrift({
    altitudes: smoothedAltitudes,
    targetNetElevationChangeMeters: resolveTargetNetElevationChangeMeters(orderedLocations, options.forceClosedLoop),
    cumulativeDistances,
  });
  const calibratedAltitudes = calibrateAltitudeTotals({
    altitudes: correctedAltitudes,
    cumulativeDistances,
    targetAscentMeters: options.targetAscentMeters,
    targetDescentMeters: options.targetDescentMeters,
  });

  const microSegments: GapMicroSegment[] = [];
  let elevationAscentMeters = 0;
  let elevationDescentMeters = 0;
  let accumulatedDistanceMeters = 0;
  let accumulatedDurationSeconds = 0;
  let accumulatedElevationGainMeters = 0;
  let accumulatedElevationLossMeters = 0;
  let binStartedAt = orderedLocations[0]!.timestampMs;
  let binStartAltitudeMeters = calibratedAltitudes[0]!;

  const flushBin = (endedAt: number, endAltitudeMeters: number, force = false) => {
    if (
      (!force && accumulatedDistanceMeters < TARGET_SEGMENT_DISTANCE_METERS) ||
      accumulatedDurationSeconds <= 0 ||
      endedAt <= binStartedAt
    ) {
      return;
    }

    const altitudeDelta = endAltitudeMeters - binStartAltitudeMeters;
    const grade = clampGrade(altitudeDelta / accumulatedDistanceMeters);
    const rawPaceSecondsPerMeter = accumulatedDurationSeconds / accumulatedDistanceMeters;
    const gradeAdjustedPaceSecondsPerMeter = calculateGradeAdjustedPace(rawPaceSecondsPerMeter, grade);

    microSegments.push({
      startedAt: binStartedAt,
      endedAt,
      distanceMeters: accumulatedDistanceMeters,
      durationSeconds: accumulatedDurationSeconds,
      rawPaceSecondsPerMeter,
      gradeAdjustedPaceSecondsPerMeter,
      grade,
      elevationGainMeters: accumulatedElevationGainMeters,
      elevationLossMeters: accumulatedElevationLossMeters,
    });

    accumulatedDistanceMeters = 0;
    accumulatedDurationSeconds = 0;
    accumulatedElevationGainMeters = 0;
    accumulatedElevationLossMeters = 0;
    binStartedAt = endedAt;
    binStartAltitudeMeters = endAltitudeMeters;
  };

  for (let index = 1; index < orderedLocations.length; index += 1) {
    const previous = orderedLocations[index - 1]!;
    const current = orderedLocations[index]!;
    const startedAt = previous.timestampMs;
    const endedAt = current.timestampMs;
    if (endedAt <= startedAt) {
      continue;
    }

    const distanceMeters = resolveSegmentDistanceMeters(previous, current);
    if (!Number.isFinite(distanceMeters) || distanceMeters < MIN_POINT_DISTANCE_METERS) {
      continue;
    }

    const durationSeconds = (endedAt - startedAt) / 1000;
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      continue;
    }

    const altitudeDelta = calibratedAltitudes[index]! - calibratedAltitudes[index - 1]!;
    const elevationGainMeters = Math.max(altitudeDelta, 0);
    const elevationLossMeters = Math.max(-altitudeDelta, 0);

    elevationAscentMeters += elevationGainMeters;
    elevationDescentMeters += elevationLossMeters;
    accumulatedDistanceMeters += distanceMeters;
    accumulatedDurationSeconds += durationSeconds;
    accumulatedElevationGainMeters += elevationGainMeters;
    accumulatedElevationLossMeters += elevationLossMeters;

    flushBin(endedAt, calibratedAltitudes[index]!);
  }

  if (accumulatedDistanceMeters > 0 && accumulatedDurationSeconds > 0) {
    flushBin(
      orderedLocations[orderedLocations.length - 1]!.timestampMs,
      calibratedAltitudes[calibratedAltitudes.length - 1]!,
      microSegments.length === 0 || accumulatedDistanceMeters >= TARGET_SEGMENT_DISTANCE_METERS / 2,
    );
  }

  let totalDistanceMeters = 0;
  let totalDurationSeconds = 0;
  let weightedGapSeconds = 0;
  for (const segment of microSegments) {
    totalDistanceMeters += segment.distanceMeters;
    totalDurationSeconds += segment.durationSeconds;
    weightedGapSeconds += segment.gradeAdjustedPaceSecondsPerMeter * segment.distanceMeters;
  }

  if (microSegments.length === 0 || totalDistanceMeters <= 0 || totalDurationSeconds <= 0) {
    return null;
  }

  return {
    rawPaceSecondsPerMeter: totalDurationSeconds / totalDistanceMeters,
    gradeAdjustedPaceSecondsPerMeter: weightedGapSeconds / totalDistanceMeters,
    elevationAscentMeters,
    elevationDescentMeters,
    microSegments,
  };
}

export function aggregateGapMicroSegmentsForInterval(
  microSegments: readonly GapMicroSegment[],
  startedAt: number,
  endedAt: number,
): GapIntervalAggregate | null {
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt <= startedAt) {
    return null;
  }

  let overlappedDistanceMeters = 0;
  let overlappedDurationSeconds = 0;
  let weightedGapSeconds = 0;

  for (const segment of microSegments) {
    const overlapStartedAt = Math.max(startedAt, segment.startedAt);
    const overlapEndedAt = Math.min(endedAt, segment.endedAt);
    if (overlapEndedAt <= overlapStartedAt) {
      continue;
    }

    const overlapDurationMs = overlapEndedAt - overlapStartedAt;
    const segmentDurationMs = segment.endedAt - segment.startedAt;
    if (segmentDurationMs <= 0) {
      continue;
    }

    const overlapRatio = overlapDurationMs / segmentDurationMs;
    const distanceMeters = segment.distanceMeters * overlapRatio;
    const durationSeconds = segment.durationSeconds * overlapRatio;
    if (distanceMeters <= 0 || durationSeconds <= 0) {
      continue;
    }

    overlappedDistanceMeters += distanceMeters;
    overlappedDurationSeconds += durationSeconds;
    weightedGapSeconds += segment.gradeAdjustedPaceSecondsPerMeter * distanceMeters;
  }

  if (overlappedDistanceMeters <= 0 || overlappedDurationSeconds <= 0) {
    return null;
  }

  return {
    distanceMeters: overlappedDistanceMeters,
    durationSeconds: overlappedDurationSeconds,
    rawPaceSecondsPerMeter: overlappedDurationSeconds / overlappedDistanceMeters,
    gradeAdjustedPaceSecondsPerMeter: weightedGapSeconds / overlappedDistanceMeters,
  };
}

export function hasMeaningfulGapDifference(
  rawPaceSecondsPerMeter: number | undefined,
  gradeAdjustedPaceSecondsPerMeter: number | undefined,
  thresholdRatio = 0.03,
): boolean {
  if (
    typeof rawPaceSecondsPerMeter !== "number" ||
    typeof gradeAdjustedPaceSecondsPerMeter !== "number" ||
    rawPaceSecondsPerMeter <= 0 ||
    gradeAdjustedPaceSecondsPerMeter <= 0
  ) {
    return false;
  }

  return Math.abs(rawPaceSecondsPerMeter - gradeAdjustedPaceSecondsPerMeter) / rawPaceSecondsPerMeter >= thresholdRatio;
}

function clampGrade(grade: number): number {
  return Math.max(-MAX_ABSOLUTE_GRADE, Math.min(MAX_ABSOLUTE_GRADE, grade));
}

function hasUsableAccuracy(location: GapRouteLocation): boolean {
  if (
    typeof location.horizontalAccuracyMeters === "number" &&
    Number.isFinite(location.horizontalAccuracyMeters) &&
    location.horizontalAccuracyMeters >= 0 &&
    location.horizontalAccuracyMeters > MAX_HORIZONTAL_ACCURACY_METERS
  ) {
    return false;
  }

  if (
    typeof location.verticalAccuracyMeters === "number" &&
    Number.isFinite(location.verticalAccuracyMeters) &&
    location.verticalAccuracyMeters >= 0 &&
    location.verticalAccuracyMeters > MAX_VERTICAL_ACCURACY_METERS
  ) {
    return false;
  }

  return true;
}

function resolveSegmentDistanceMeters(
  left: GapRouteLocation,
  right: GapRouteLocation,
): number {
  if (typeof right.distanceFromPreviousMeters === "number" && Number.isFinite(right.distanceFromPreviousMeters)) {
    if (right.distanceFromPreviousMeters > 0) {
      return right.distanceFromPreviousMeters;
    }
  }

  return haversineDistanceMeters(left, right);
}

function buildCumulativeDistances(routeLocations: readonly GapRouteLocation[]): number[] {
  const cumulativeDistances = [0];
  let totalDistanceMeters = 0;

  for (let index = 1; index < routeLocations.length; index += 1) {
    const previous = routeLocations[index - 1]!;
    const current = routeLocations[index]!;
    const distanceMeters = resolveSegmentDistanceMeters(previous, current);
    totalDistanceMeters += Number.isFinite(distanceMeters) && distanceMeters > 0 ? distanceMeters : 0;
    cumulativeDistances.push(totalDistanceMeters);
  }

  return cumulativeDistances;
}

function correctAltitudeDrift(args: {
  altitudes: readonly number[];
  targetNetElevationChangeMeters: number;
  cumulativeDistances: readonly number[];
}): number[] {
  const totalDistanceMeters = args.cumulativeDistances[args.cumulativeDistances.length - 1] ?? 0;
  if (!Number.isFinite(totalDistanceMeters) || totalDistanceMeters <= 0) {
    return [...args.altitudes];
  }

  const smoothedDelta = args.altitudes[args.altitudes.length - 1]! - args.altitudes[0]!;
  const driftDelta = smoothedDelta - args.targetNetElevationChangeMeters;

  return args.altitudes.map((altitude, index) => altitude - driftDelta * ((args.cumulativeDistances[index] ?? 0) / totalDistanceMeters));
}

function calibrateAltitudeTotals(args: {
  altitudes: readonly number[];
  cumulativeDistances: readonly number[];
  targetAscentMeters?: number;
  targetDescentMeters?: number;
}): number[] {
  const routeTotals = summarizeElevationTotals(args.altitudes);
  const shouldScaleAscent =
    typeof args.targetAscentMeters === "number" && Number.isFinite(args.targetAscentMeters) && args.targetAscentMeters > 0 && routeTotals.ascentMeters > 0;
  const shouldScaleDescent =
    typeof args.targetDescentMeters === "number" &&
    Number.isFinite(args.targetDescentMeters) &&
    args.targetDescentMeters > 0 &&
    routeTotals.descentMeters > 0;

  if (!shouldScaleAscent && !shouldScaleDescent) {
    return [...args.altitudes];
  }

  const ascentScale = shouldScaleAscent ? clampScale(args.targetAscentMeters! / routeTotals.ascentMeters) : 1;
  const descentScale = shouldScaleDescent ? clampScale(args.targetDescentMeters! / routeTotals.descentMeters) : 1;
  const scaledAltitudes = [args.altitudes[0]!];

  for (let index = 1; index < args.altitudes.length; index += 1) {
    const rawDelta = args.altitudes[index]! - args.altitudes[index - 1]!;
    const scaledDelta = rawDelta >= 0 ? rawDelta * ascentScale : rawDelta * descentScale;
    scaledAltitudes.push(scaledAltitudes[index - 1]! + scaledDelta);
  }

  const targetNetElevationChangeMeters = args.altitudes[args.altitudes.length - 1]! - args.altitudes[0]!;
  return correctAltitudeDrift({
    altitudes: scaledAltitudes,
    cumulativeDistances: args.cumulativeDistances,
    targetNetElevationChangeMeters,
  });
}

function summarizeElevationTotals(altitudes: readonly number[]): { ascentMeters: number; descentMeters: number } {
  let ascentMeters = 0;
  let descentMeters = 0;

  for (let index = 1; index < altitudes.length; index += 1) {
    const delta = altitudes[index]! - altitudes[index - 1]!;
    if (delta >= 0) {
      ascentMeters += delta;
    } else {
      descentMeters += -delta;
    }
  }

  return {
    ascentMeters,
    descentMeters,
  };
}

function clampScale(value: number): number {
  return Math.max(0.5, Math.min(2, value));
}

function resolveTargetNetElevationChangeMeters(
  routeLocations: readonly GapRouteLocation[],
  forceClosedLoop: boolean | undefined,
): number {
  if (routeLocations.length < 2) {
    return 0;
  }

  const start = routeLocations[0]!;
  const end = routeLocations[routeLocations.length - 1]!;
  const isClosedLoop = forceClosedLoop || haversineDistanceMeters(start, end) <= 150;
  if (isClosedLoop) {
    return 0;
  }

  return end.altitudeMeters - start.altitudeMeters;
}

function haversineDistanceMeters(
  left: Pick<GapRouteLocation, "latitude" | "longitude">,
  right: Pick<GapRouteLocation, "latitude" | "longitude">,
): number {
  const leftLatitude = toRadians(left.latitude);
  const rightLatitude = toRadians(right.latitude);
  const deltaLatitude = toRadians(right.latitude - left.latitude);
  const deltaLongitude = toRadians(right.longitude - left.longitude);

  const a =
    Math.sin(deltaLatitude / 2) * Math.sin(deltaLatitude / 2) +
    Math.cos(leftLatitude) *
      Math.cos(rightLatitude) *
      Math.sin(deltaLongitude / 2) *
      Math.sin(deltaLongitude / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function median(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  const middleIndex = Math.floor(ordered.length / 2);
  if (ordered.length % 2 === 0) {
    return (ordered[middleIndex - 1]! + ordered[middleIndex]!) / 2;
  }

  return ordered[middleIndex]!;
}
