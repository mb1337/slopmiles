export type PlanAssessmentProposal = {
  summary: string;
  volumeAdherence: number;
  paceAdherence: number;
  vdotStart: number;
  vdotEnd: number;
  highlights: string[];
  areasForImprovement: string[];
  nextPlanSuggestion: string;
  discussionPrompts: string[];
};

export type PlanAssessmentValidationResult = {
  proposal: PlanAssessmentProposal;
  corrections: string[];
};

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeStringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }

  const normalized = value
    .map((entry) => asTrimmedString(entry))
    .filter((entry): entry is string => Boolean(entry));

  if (normalized.length === 0) {
    throw new Error(`${label} must include at least one item.`);
  }

  return normalized;
}

export function validatePlanAssessmentResponse(payload: unknown): PlanAssessmentValidationResult {
  const candidate = asObject(payload, "plan-assessment payload");
  const corrections: string[] = [];

  const summary = asTrimmedString(candidate.summary);
  const nextPlanSuggestion = asTrimmedString(candidate.nextPlanSuggestion);
  if (!summary) {
    throw new Error("summary is required.");
  }
  if (!nextPlanSuggestion) {
    throw new Error("nextPlanSuggestion is required.");
  }

  const rawVolumeAdherence = asFiniteNumber(candidate.volumeAdherence);
  const rawPaceAdherence = asFiniteNumber(candidate.paceAdherence);
  const rawVdotStart = asFiniteNumber(candidate.vdotStart);
  const rawVdotEnd = asFiniteNumber(candidate.vdotEnd);

  if (rawVolumeAdherence === undefined || rawPaceAdherence === undefined) {
    throw new Error("volumeAdherence and paceAdherence are required finite numbers.");
  }
  if (rawVdotStart === undefined || rawVdotEnd === undefined) {
    throw new Error("vdotStart and vdotEnd are required finite numbers.");
  }

  const volumeAdherence = clamp(rawVolumeAdherence, 0, 1);
  const paceAdherence = clamp(rawPaceAdherence, 0, 1);
  if (volumeAdherence !== rawVolumeAdherence) {
    corrections.push("volumeAdherence was clamped into [0, 1].");
  }
  if (paceAdherence !== rawPaceAdherence) {
    corrections.push("paceAdherence was clamped into [0, 1].");
  }

  const highlights = normalizeStringList(candidate.highlights, "highlights");
  const areasForImprovement = normalizeStringList(candidate.areasForImprovement, "areasForImprovement");
  const discussionPrompts = normalizeStringList(candidate.discussionPrompts, "discussionPrompts");

  return {
    proposal: {
      summary,
      volumeAdherence: Math.round(volumeAdherence * 1000) / 1000,
      paceAdherence: Math.round(paceAdherence * 1000) / 1000,
      vdotStart: Math.round(rawVdotStart * 10) / 10,
      vdotEnd: Math.round(rawVdotEnd * 10) / 10,
      highlights,
      areasForImprovement,
      nextPlanSuggestion,
      discussionPrompts,
    },
    corrections,
  };
}
