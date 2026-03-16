import { z } from "zod";

import { strengthEquipmentOptions, workoutTypes, workoutVenues } from "./constants";

const workoutTypeSchema = z.enum(workoutTypes);
const workoutVenueSchema = z.enum(workoutVenues);
const strengthEquipmentSchema = z.enum(strengthEquipmentOptions);
const weeklyVolumeProfileEntrySchema = z.strictObject({
  weekNumber: z.number(),
  percentOfPeak: z.number(),
});
const weeklyEmphasisEntrySchema = z.strictObject({
  weekNumber: z.number(),
  emphasis: z.string(),
});
const workoutSegmentSchema = z.strictObject({
  label: z.string(),
  paceZone: z.string(),
  targetValue: z.number(),
  targetUnit: z.enum(["seconds", "meters"]),
  repetitions: z.number().nullable(),
  restValue: z.number().nullable(),
  restUnit: z.enum(["seconds", "meters"]).nullable(),
});
const weekWorkoutSchema = z.strictObject({
  type: workoutTypeSchema,
  volumePercent: z.number(),
  scheduledDate: z.string(),
  venue: workoutVenueSchema,
  notes: z.string().nullable(),
  segments: z.array(workoutSegmentSchema),
});
const strengthExerciseSchema = z.strictObject({
  name: z.string(),
  sets: z.number(),
  reps: z.number().nullable(),
  holdSeconds: z.number().nullable(),
  restSeconds: z.number().nullable(),
  equipment: strengthEquipmentSchema.nullable(),
  cues: z.string().nullable(),
});
const strengthWorkoutSchema = z.strictObject({
  title: z.string(),
  plannedMinutes: z.number(),
  notes: z.string().nullable(),
  exercises: z.array(strengthExerciseSchema),
});

export const planDraftSchema = z.strictObject({
  numberOfWeeks: z.number(),
  peakWeekVolume: z.number(),
  weeklyVolumeProfile: z.array(weeklyVolumeProfileEntrySchema),
  weeklyEmphasis: z.array(weeklyEmphasisEntrySchema),
  rationale: z.string(),
  strengthApproach: z.string().nullable(),
});

export const weekDraftSchema = z.strictObject({
  workouts: z.array(weekWorkoutSchema),
  strengthWorkouts: z.array(strengthWorkoutSchema).nullable(),
  coachNotes: z.string(),
});

export const assessmentDraftSchema = z.strictObject({
  summary: z.string(),
  volumeAdherence: z.number(),
  paceAdherence: z.number(),
  vdotStart: z.number(),
  vdotEnd: z.number(),
  highlights: z.array(z.string()),
  areasForImprovement: z.array(z.string()),
  nextPlanSuggestion: z.string(),
  discussionPrompts: z.array(z.string()),
});

export type PlanDraftObject = z.infer<typeof planDraftSchema>;
export type WeekDraftObject = z.infer<typeof weekDraftSchema>;
export type AssessmentDraftObject = z.infer<typeof assessmentDraftSchema>;
