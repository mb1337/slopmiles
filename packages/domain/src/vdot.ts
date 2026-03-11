/**
 * Based on "Oxygen Power: Performance Tables for Distance Runners"
 * by Jack Daniels and Jimmy Gilbert.
 */

export const TRAINING_ZONES = ["E", "M", "T", "I", "R"] as const;
export type TrainingZone = (typeof TRAINING_ZONES)[number];
export const SUPPORTED_RACE_PACE_LABELS = [
  "5K pace",
  "10K pace",
  "Half Marathon pace",
  "Marathon pace",
] as const;
export type SupportedRacePaceLabel = (typeof SUPPORTED_RACE_PACE_LABELS)[number];

const constants = {
  vo2Cost: { a: 0.000104, b: 0.182258, c: -4.6 },
  intensity: { p0: 0.8, p1: 0.2989558, p2: 0.1894393, k1: -0.1932605, k2: -0.012778 },
  velocity: { a: -0.007546, b: 5.000663, c: 29.54 },
} as const;

const zoneIntensityRanges: Record<TrainingZone, readonly [number, number]> = {
  E: [0.62, 0.7],
  M: [0.82, 0.82],
  T: [0.88, 0.88],
  I: [0.97, 0.97],
  R: [1.06, 1.06],
};

const zoneRepresentativeIntensity: Record<TrainingZone, number> = {
  E: 0.66,
  M: 0.82,
  T: 0.88,
  I: 0.97,
  R: 1.06,
};

export type PaceRange = [number, number];

export type VdotPaceRanges = {
  E: PaceRange;
  M: PaceRange;
  T: PaceRange;
  I: PaceRange;
  R: PaceRange;
};

/**
 * All distances are meters. Time is seconds.
 */
export function calculateVdotFromRaceTime(distanceMeters: number, timeSeconds: number): number {
  assertPositiveFinite(distanceMeters, "distanceMeters");
  assertPositiveFinite(timeSeconds, "timeSeconds");

  return calculateVdot(distanceMeters, timeSeconds / 60);
}

/**
 * Pace is seconds per meter for the selected training zone.
 */
export function calculateVdotFromPace(paceSecondsPerMeter: number, zone: TrainingZone): number {
  assertPositiveFinite(paceSecondsPerMeter, "paceSecondsPerMeter");

  const velocity = 60 / paceSecondsPerMeter;
  const vo2Cost = calculateVo2CostByVelocity(velocity);
  return vo2Cost / zoneRepresentativeIntensity[zone];
}

/**
 * Returns pace ranges in seconds per meter.
 */
export function calculatePacesFromVdot(vdot: number): VdotPaceRanges {
  assertPositiveFinite(vdot, "vdot");

  return {
    E: toPaceRange(vdot, zoneIntensityRanges.E),
    M: toPaceRange(vdot, zoneIntensityRanges.M),
    T: toPaceRange(vdot, zoneIntensityRanges.T),
    I: toPaceRange(vdot, zoneIntensityRanges.I),
    R: toPaceRange(vdot, zoneIntensityRanges.R),
  };
}

export function vdotEasyPace(vdot: number): [number, number] {
  return calculatePacesFromVdot(vdot).E;
}

export function vdotMarathonPace(vdot: number): number {
  return calculatePacesFromVdot(vdot).M[0];
}

export function vdotThresholdPace(vdot: number): number {
  return calculatePacesFromVdot(vdot).T[0];
}

export function vdotIntervalPace(vdot: number): number {
  return calculatePacesFromVdot(vdot).I[0];
}

export function vdotRepetitionPace(vdot: number): number {
  return calculatePacesFromVdot(vdot).R[0];
}

/**
 * Distance is meters. Returns projected race time in seconds.
 */
export function projectedRaceTime(vdot: number, distanceMeters: number): number {
  assertPositiveFinite(vdot, "vdot");
  assertPositiveFinite(distanceMeters, "distanceMeters");

  return calculateTime(vdot, distanceMeters) * 60;
}

export function resolveDisplayedPaceRangeSecondsPerMeterFromVdot(
  vdot: number | null | undefined,
  paceZone: string,
): PaceRange | null {
  if (typeof vdot !== "number" || !Number.isFinite(vdot) || vdot <= 0) {
    return null;
  }

  const normalized = paceZone.trim();
  if (normalized !== "E") {
    return null;
  }

  return calculatePacesFromVdot(vdot).E;
}

export function resolveRepresentativePaceSecondsPerMeterFromVdot(
  vdot: number | null | undefined,
  paceZone: string,
): number | null {
  if (typeof vdot !== "number" || !Number.isFinite(vdot) || vdot <= 0) {
    return null;
  }

  const normalized = paceZone.trim();
  if (TRAINING_ZONES.includes(normalized as TrainingZone)) {
    const paces = calculatePacesFromVdot(vdot);
    switch (normalized as TrainingZone) {
      case "E":
        return averagePaceRange(paces.E);
      case "M":
        return paces.M[0];
      case "T":
        return paces.T[0];
      case "I":
        return paces.I[0];
      case "R":
        return paces.R[0];
      default:
        return null;
    }
  }

  const raceDistance = racePaceDistanceMeters(normalized);
  return raceDistance === null ? null : projectedRaceTime(vdot, raceDistance) / raceDistance;
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number`);
  }
}

function toPaceRange(vdot: number, intensityRange: readonly [number, number]): PaceRange {
  const [lowIntensity, highIntensity] = intensityRange;
  return [60 / trainingVelocity(vdot, lowIntensity), 60 / trainingVelocity(vdot, highIntensity)];
}

function trainingVelocity(vdot: number, intensity: number): number {
  return calculateVelocity(vdot, intensity);
}

function calculateVo2Cost(distance: number, time: number): number {
  return calculateVo2CostByVelocity(distance / time);
}

function calculateVo2Cost_dt(distance: number, time: number): number {
  const { a, b } = constants.vo2Cost;
  return (-2 * a * distance * distance) / Math.pow(time, 3) - (b * distance) / (time * time);
}

function calculateVo2CostByVelocity(velocity: number): number {
  const { a, b, c } = constants.vo2Cost;
  return a * velocity * velocity + b * velocity + c;
}

function calculateIntensity(time: number): number {
  const { p0, p1, p2, k1, k2 } = constants.intensity;
  return p1 * Math.exp(k1 * time) + p2 * Math.exp(k2 * time) + p0;
}

function calculateIntensity_dt(time: number): number {
  const { p1, p2, k1, k2 } = constants.intensity;
  return k1 * p1 * Math.exp(k1 * time) + k2 * p2 * Math.exp(k2 * time);
}

function calculateVelocity(vdot: number, intensity: number): number {
  const vo2 = vdot * intensity;
  const { a, b, c } = constants.velocity;
  return a * vo2 * vo2 + b * vo2 + c;
}

function calculateTime(vdot: number, distance: number): number {
  let t = distance / 280;

  for (let i = 0; i < 1000; i += 1) {
    const intensity = calculateIntensity(t);
    const vo2Cost = calculateVo2Cost(distance, t);
    const check = vo2Cost / vdot - intensity;

    if (Math.abs(check) < 0.0001) {
      return t;
    }

    const derivative = calculateVo2Cost_dt(distance, t) / vdot - calculateIntensity_dt(t);
    if (!Number.isFinite(derivative) || derivative === 0) {
      break;
    }

    const diff = check / derivative;
    t -= diff;

    if (t <= 0 || !Number.isFinite(t)) {
      t = 0.1;
    }

    if (Math.abs(diff) < 0.001) {
      return t;
    }
  }

  throw new Error("Failed to converge on value");
}

function calculateVdot(distance: number, time: number): number {
  return calculateVo2Cost(distance, time) / calculateIntensity(time);
}

function averagePaceRange(range: readonly [number, number]): number {
  return (range[0] + range[1]) / 2;
}

function racePaceDistanceMeters(paceZone: string): number | null {
  switch (paceZone.toLowerCase()) {
    case "5k pace":
      return 5_000;
    case "10k pace":
      return 10_000;
    case "half marathon pace":
      return 21_097.5;
    case "marathon pace":
      return 42_195;
    default:
      return null;
  }
}
