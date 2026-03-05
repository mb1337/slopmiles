import type { GoalType, VolumeMode } from "./constants";

export type PlanGenerationProposal = {
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
  strengthApproach?: string;
};

export type PlanGenerationValidationResult = {
  proposal: PlanGenerationProposal;
  corrections: string[];
};

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return value;
}

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function asNormalizedUnit(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return value.trim().toLowerCase();
}

function normalizeWeekCount(
  payload: Record<string, unknown>,
  goalType: GoalType,
  authoritativeNumberOfWeeks?: number,
  corrections?: string[],
): number {
  const fromPayload = asFiniteNumber(payload.numberOfWeeks);

  if (typeof authoritativeNumberOfWeeks === "number") {
    if (fromPayload !== undefined && Math.round(fromPayload) !== authoritativeNumberOfWeeks) {
      corrections?.push("numberOfWeeks adjusted to authoritative value.");
    }
    return authoritativeNumberOfWeeks;
  }

  if (goalType === "race" && fromPayload === undefined) {
    throw new Error("numberOfWeeks is required when no authoritative race week count is provided.");
  }

  if (fromPayload === undefined) {
    throw new Error("numberOfWeeks is required.");
  }

  const rounded = Math.round(fromPayload);
  const bounded = clamp(rounded, 4, 52);
  if (bounded !== rounded) {
    corrections?.push("numberOfWeeks was clamped into [4, 52].");
  }
  return bounded;
}

function normalizeWeeklyVolumeProfile(
  value: unknown,
  numberOfWeeks: number,
  corrections: string[],
): Array<{ weekNumber: number; percentOfPeak: number }> {
  const map: Record<string, unknown> = Array.isArray(value)
    ? Object.fromEntries(
        value.map((entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            throw new Error("weeklyVolumeProfile array entries must be objects.");
          }

          const candidate = entry as {
            weekNumber?: unknown;
            percentOfPeak?: unknown;
          };
          const weekNumber = asFiniteNumber(candidate.weekNumber);
          const percentOfPeak = asFiniteNumber(candidate.percentOfPeak);
          if (weekNumber === undefined || percentOfPeak === undefined) {
            throw new Error("weeklyVolumeProfile entries must include weekNumber and percentOfPeak numbers.");
          }
          return [String(Math.round(weekNumber)), percentOfPeak] as const;
        }),
      )
    : asObject(value, "weeklyVolumeProfile");
  const result: Array<{ weekNumber: number; percentOfPeak: number }> = [];

  for (let weekNumber = 1; weekNumber <= numberOfWeeks; weekNumber += 1) {
    const raw = asFiniteNumber(map[String(weekNumber)]);
    if (raw === undefined) {
      throw new Error(`weeklyVolumeProfile is missing week ${weekNumber}.`);
    }
    const bounded = clamp(raw, 0, 1);
    if (bounded !== raw) {
      corrections.push(`weeklyVolumeProfile[${weekNumber}] was clamped into [0, 1].`);
    }
    result.push({
      weekNumber,
      percentOfPeak: Math.round(bounded * 1000) / 1000,
    });
  }

  return result;
}

function normalizeWeeklyEmphasis(
  value: unknown,
  numberOfWeeks: number,
): Array<{ weekNumber: number; emphasis: string }> {
  const map: Record<string, unknown> = Array.isArray(value)
    ? Object.fromEntries(
        value.map((entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            throw new Error("weeklyEmphasis array entries must be objects.");
          }

          const candidate = entry as {
            weekNumber?: unknown;
            emphasis?: unknown;
          };
          const weekNumber = asFiniteNumber(candidate.weekNumber);
          const emphasis = asTrimmedString(candidate.emphasis);
          if (weekNumber === undefined || !emphasis) {
            throw new Error("weeklyEmphasis entries must include weekNumber and emphasis.");
          }
          return [String(Math.round(weekNumber)), emphasis] as const;
        }),
      )
    : asObject(value, "weeklyEmphasis");
  const result: Array<{ weekNumber: number; emphasis: string }> = [];

  for (let weekNumber = 1; weekNumber <= numberOfWeeks; weekNumber += 1) {
    const emphasis = asTrimmedString(map[String(weekNumber)]);
    if (!emphasis) {
      throw new Error(`weeklyEmphasis is missing week ${weekNumber}.`);
    }
    result.push({
      weekNumber,
      emphasis,
    });
  }

  return result;
}

export function validatePlanGenerationResponse(
  payload: unknown,
  options: {
    goalType: GoalType;
    volumeMode: VolumeMode;
    authoritativeNumberOfWeeks?: number;
  },
): PlanGenerationValidationResult {
  const candidate = asObject(payload, "plan-generation payload");
  const corrections: string[] = [];

  const numberOfWeeks = normalizeWeekCount(
    candidate,
    options.goalType,
    options.authoritativeNumberOfWeeks,
    corrections,
  );

  const rawPeakWeekVolume = asFiniteNumber(candidate.peakWeekVolume);
  if (rawPeakWeekVolume === undefined) {
    throw new Error("peakWeekVolume is required and must be a finite number.");
  }

  const explicitUnit =
    asNormalizedUnit(candidate.peakWeekVolumeUnit) ??
    asNormalizedUnit(candidate.peakVolumeUnit) ??
    asNormalizedUnit(candidate.unit);

  let normalizedPeakWeekVolume = rawPeakWeekVolume;
  if (options.volumeMode === "time") {
    const rationale = asTrimmedString(candidate.rationale)?.toLowerCase() ?? "";
    const likelyHours = explicitUnit === "hours" || explicitUnit === "hour" || explicitUnit === "hrs" || explicitUnit === "hr";
    const impliedHours = !likelyHours && normalizedPeakWeekVolume <= 12 && rationale.includes("hour");
    if (likelyHours || impliedHours) {
      normalizedPeakWeekVolume *= 60;
      corrections.push("peakWeekVolume interpreted as hours and converted to minutes.");
    }
  } else {
    if (explicitUnit === "km" || explicitUnit === "kilometer" || explicitUnit === "kilometers") {
      normalizedPeakWeekVolume *= 1000;
      corrections.push("peakWeekVolume interpreted as kilometers and converted to meters.");
    } else if (explicitUnit === "mi" || explicitUnit === "mile" || explicitUnit === "miles") {
      normalizedPeakWeekVolume *= 1609.34;
      corrections.push("peakWeekVolume interpreted as miles and converted to meters.");
    }
  }

  const peakWeekVolume = Math.max(1, normalizedPeakWeekVolume);
  if (peakWeekVolume !== normalizedPeakWeekVolume) {
    corrections.push("peakWeekVolume was clamped to be positive.");
  }

  const weeklyVolumeProfile = normalizeWeeklyVolumeProfile(
    candidate.weeklyVolumeProfile,
    numberOfWeeks,
    corrections,
  );
  const weeklyEmphasis = normalizeWeeklyEmphasis(candidate.weeklyEmphasis, numberOfWeeks);

  const rationale = asTrimmedString(candidate.rationale);
  if (!rationale) {
    throw new Error("rationale is required.");
  }

  const strengthApproach = asTrimmedString(candidate.strengthApproach);

  return {
    proposal: {
      numberOfWeeks,
      peakWeekVolume,
      weeklyVolumeProfile,
      weeklyEmphasis,
      rationale,
      ...(strengthApproach ? { strengthApproach } : {}),
    },
    corrections,
  };
}
