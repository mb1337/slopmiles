import { addDays, parseDateKey, weekdayNameFromDateKey, type DateKey } from "../packages/domain/src/calendar";
import { normalizeWorkoutPercents } from "../packages/domain/src/index";
import { strengthEquipmentOptions, weekdays, workoutTypes, workoutVenues } from "./constants";

export type WeekDetailWorkoutProposal = {
  type: (typeof workoutTypes)[number];
  volumePercent: number;
  scheduledDate: DateKey;
  venue: (typeof workoutVenues)[number];
  notes?: string;
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

export type WeekDetailProposal = {
  workouts: WeekDetailWorkoutProposal[];
  strengthWorkouts?: Array<{
    title: string;
    plannedMinutes: number;
    notes?: string;
    exercises: Array<{
      name: string;
      sets: number;
      reps?: number;
      holdSeconds?: number;
      restSeconds?: number;
      equipment?: (typeof strengthEquipmentOptions)[number];
      cues?: string;
    }>;
  }>;
  coachNotes: string;
};

export type WeekDetailValidationResult = {
  proposal: WeekDetailProposal;
  corrections: string[];
};

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asOptionalPositiveInteger(value: unknown): number | undefined {
  const parsed = asFiniteNumber(value);
  if (parsed === undefined) {
    return undefined;
  }
  const rounded = Math.round(parsed);
  return rounded > 0 ? rounded : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundToThousandth(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function isRecognizedPaceZone(value: string): boolean {
  const normalized = value.trim();
  return ["E", "C", "M", "T", "I", "R"].includes(normalized) || /pace$/i.test(normalized);
}

function normalizeDateKey(value: unknown, label: string): DateKey {
  const raw = asString(value);
  if (!raw) {
    throw new Error(`${label} is required.`);
  }
  parseDateKey(raw);
  return raw as DateKey;
}

function normalizeSegments(value: unknown): WeekDetailWorkoutProposal["segments"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((segment, index) => {
    const candidate = asObject(segment, `segment ${index + 1}`);
    const label = asString(candidate.label);
    const paceZone = asString(candidate.paceZone);
    const targetValue = asFiniteNumber(candidate.targetValue);
    const targetUnit = candidate.targetUnit;
    const repetitions = asOptionalPositiveInteger(candidate.repetitions);
    const restValue = asFiniteNumber(candidate.restValue);
    const restUnit = candidate.restUnit;

    if (!label || !paceZone || targetValue === undefined || targetValue <= 0) {
      throw new Error("Every segment requires label, paceZone, and positive targetValue.");
    }

    if (!isRecognizedPaceZone(paceZone)) {
      throw new Error(`Unsupported pace zone "${paceZone}".`);
    }

    if (targetUnit !== "seconds" && targetUnit !== "meters") {
      throw new Error("Segment targetUnit must be seconds or meters.");
    }

    if ((restValue === undefined) !== (restUnit === undefined)) {
      throw new Error("Segment restValue and restUnit must be provided together.");
    }

    if (restValue !== undefined && restValue <= 0) {
      throw new Error("Segment restValue must be positive.");
    }

    if (restUnit !== undefined && restUnit !== "seconds" && restUnit !== "meters") {
      throw new Error("Segment restUnit must be seconds or meters.");
    }

    return {
      label,
      paceZone,
      targetValue: Math.round(targetValue),
      targetUnit,
      ...(repetitions ? { repetitions } : {}),
      ...(restValue !== undefined ? { restValue: Math.round(restValue), restUnit } : {}),
    };
  });
}

function normalizeStrengthWorkouts(
  value: unknown,
): NonNullable<WeekDetailProposal["strengthWorkouts"]> {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error("strengthWorkouts must be an array when provided.");
  }

  return value.map((entry, index) => {
    const candidate = asObject(entry, `strengthWorkout ${index + 1}`);
    const title = asString(candidate.title);
    const plannedMinutes = asFiniteNumber(candidate.plannedMinutes);
    const notes = asString(candidate.notes);
    const exercisesRaw = candidate.exercises;

    if (!title || plannedMinutes === undefined || plannedMinutes <= 0) {
      throw new Error("Every strength workout requires title and positive plannedMinutes.");
    }

    if (!Array.isArray(exercisesRaw) || exercisesRaw.length === 0) {
      throw new Error("Every strength workout requires at least one exercise.");
    }

    const exercises = exercisesRaw.map((exercise, exerciseIndex) => {
      const parsed = asObject(exercise, `strengthWorkout ${index + 1} exercise ${exerciseIndex + 1}`);
      const name = asString(parsed.name);
      const sets = asOptionalPositiveInteger(parsed.sets);
      const reps = asOptionalPositiveInteger(parsed.reps);
      const holdSeconds = asOptionalPositiveInteger(parsed.holdSeconds);
      const restSeconds = asOptionalPositiveInteger(parsed.restSeconds);
      const equipment = asString(parsed.equipment);
      const cues = asString(parsed.cues);

      if (!name || !sets) {
        throw new Error("Every strength exercise requires name and positive sets.");
      }

      if (!reps && !holdSeconds) {
        throw new Error("Every strength exercise requires reps or holdSeconds.");
      }

      if (equipment && !strengthEquipmentOptions.includes(equipment as (typeof strengthEquipmentOptions)[number])) {
        throw new Error(`Unsupported strength equipment "${equipment}".`);
      }

      return {
        name,
        sets,
        ...(reps ? { reps } : {}),
        ...(holdSeconds ? { holdSeconds } : {}),
        ...(restSeconds ? { restSeconds } : {}),
        ...(equipment ? { equipment: equipment as (typeof strengthEquipmentOptions)[number] } : {}),
        ...(cues ? { cues } : {}),
      };
    });

    return {
      title,
      plannedMinutes: Math.round(plannedMinutes),
      ...(notes ? { notes } : {}),
      exercises,
    };
  });
}

export function validateWeekDetailResponse(
  payload: unknown,
  options: {
    weekStartDateKey: DateKey;
    weekEndDateKey: DateKey;
    targetVolumePercent: number;
    preferredRunningDays: string[];
    trackAccess: boolean;
    lockedWorkouts?: WeekDetailWorkoutProposal[];
    volumeTargetMode?: "exact" | "upToTarget";
  },
): WeekDetailValidationResult {
  const candidate = asObject(payload, "week-detail payload");
  const workoutsRaw = candidate.workouts;
  const coachNotes = asString(candidate.coachNotes);
  const strengthWorkouts = normalizeStrengthWorkouts(candidate.strengthWorkouts);
  if (!Array.isArray(workoutsRaw)) {
    throw new Error("workouts must be an array.");
  }
  if (!coachNotes) {
    throw new Error("coachNotes is required.");
  }

  const corrections: string[] = [];
  const workouts = workoutsRaw.map((workout, index) => {
    const entry = asObject(workout, `workout ${index + 1}`);
    const type = entry.type;
    const venue = entry.venue;
    const scheduledDate = normalizeDateKey(entry.scheduledDate, `workout ${index + 1} scheduledDate`);
    const volumePercent = asFiniteNumber(entry.volumePercent);
    const notes = asString(entry.notes);

    if (!workoutTypes.includes(type as (typeof workoutTypes)[number])) {
      throw new Error(`Unsupported workout type at index ${index + 1}.`);
    }

    if (!workoutVenues.includes(venue as (typeof workoutVenues)[number])) {
      throw new Error(`Unsupported workout venue at index ${index + 1}.`);
    }

    if (volumePercent === undefined || volumePercent <= 0) {
      throw new Error(`Workout ${index + 1} requires a positive volumePercent.`);
    }

    if (scheduledDate < options.weekStartDateKey || scheduledDate > options.weekEndDateKey) {
      throw new Error(`Workout ${index + 1} is scheduled outside the target week.`);
    }

    const weekday = weekdayNameFromDateKey(scheduledDate);
    if (!options.preferredRunningDays.includes(weekday)) {
      throw new Error(`Workout ${index + 1} is placed on unavailable day ${weekday}.`);
    }

    if (!options.trackAccess && venue === "track") {
      throw new Error(`Workout ${index + 1} requires track access.`);
    }

    return {
      type: type as (typeof workoutTypes)[number],
      volumePercent,
      scheduledDate,
      venue: venue as (typeof workoutVenues)[number],
      ...(notes ? { notes } : {}),
      segments: normalizeSegments(entry.segments),
    };
  });

  workouts.sort((left, right) => {
    if (left.scheduledDate === right.scheduledDate) {
      return workoutTypes.indexOf(left.type) - workoutTypes.indexOf(right.type);
    }
    return left.scheduledDate.localeCompare(right.scheduledDate);
  });

  const lockedWorkouts = options.lockedWorkouts ?? [];
  const countsByDate = new Map<string, number>();
  for (const workout of lockedWorkouts) {
    countsByDate.set(workout.scheduledDate, (countsByDate.get(workout.scheduledDate) ?? 0) + 1);
  }
  for (const workout of workouts) {
    countsByDate.set(workout.scheduledDate, (countsByDate.get(workout.scheduledDate) ?? 0) + 1);
    if ((countsByDate.get(workout.scheduledDate) ?? 0) > 2) {
      throw new Error(`More than two workouts were scheduled on ${workout.scheduledDate}.`);
    }
  }

  const normalizedVolumeTarget = clamp(options.targetVolumePercent, 0, 1);
  const lockedVolumePercent = lockedWorkouts.reduce(
    (sum, workout) => sum + clamp(workout.volumePercent, 0, 1),
    0,
  );
  const remainingTarget = clamp(normalizedVolumeTarget - lockedVolumePercent, 0, 1);
  const clampedPercents = workouts.map((workout) => clamp(workout.volumePercent, 0, 1));

  let normalizedPercents = clampedPercents;
  if (options.volumeTargetMode === "upToTarget") {
    const proposedTotal = clampedPercents.reduce((sum, value) => sum + value, 0);
    if (proposedTotal > remainingTarget && proposedTotal > 0) {
      const scale = remainingTarget / proposedTotal;
      normalizedPercents = clampedPercents.map((value) => value * scale);
      corrections.push("Reduced generated workout volume percentages to stay within the remaining week target.");
    }
  } else {
    normalizedPercents = normalizeWorkoutPercents(clampedPercents, remainingTarget);
  }

  const normalizedWorkouts = workouts.map((workout, index) => {
    const normalizedPercent = roundToThousandth(normalizedPercents[index] ?? 0);
    if (Math.abs(normalizedPercent - workout.volumePercent) > 0.001) {
      corrections.push(`Normalized workout volume percentages to match week target for ${workout.scheduledDate}.`);
    }
    return {
      ...workout,
      volumePercent: normalizedPercent,
    };
  });

  return {
    proposal: {
      workouts: normalizedWorkouts,
      ...(strengthWorkouts.length > 0 ? { strengthWorkouts } : {}),
      coachNotes,
    },
    corrections,
  };
}

export function enumerateDateKeysInWeek(weekStartDateKey: DateKey): DateKey[] {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStartDateKey, index));
}

export function summarizeAvailableDays(days: string[]): string[] {
  return weekdays.filter((weekday) => days.includes(weekday));
}
