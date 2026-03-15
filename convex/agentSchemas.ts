import { z } from "zod";

import { strengthEquipmentOptions, workoutTypes, workoutVenues } from "./constants";

const workoutTypeSchema = z.enum(workoutTypes);
const workoutVenueSchema = z.enum(workoutVenues);
const strengthEquipmentSchema = z.enum(strengthEquipmentOptions);

export const planDraftSchema = z.object({
  numberOfWeeks: z.number(),
  peakWeekVolume: z.number(),
  weeklyVolumeProfile: z.union([
    z.array(
      z.object({
        weekNumber: z.number(),
        percentOfPeak: z.number(),
      }),
    ),
    z.record(z.string(), z.number()),
  ]),
  weeklyEmphasis: z.union([
    z.array(
      z.object({
        weekNumber: z.number(),
        emphasis: z.string(),
      }),
    ),
    z.record(z.string(), z.string()),
  ]),
  rationale: z.string(),
  strengthApproach: z.string().optional(),
});

export const weekDraftSchema = z.object({
  workouts: z.array(
    z.object({
      type: workoutTypeSchema,
      volumePercent: z.number(),
      scheduledDate: z.string(),
      venue: workoutVenueSchema,
      notes: z.string().optional(),
      segments: z.array(
        z.object({
          label: z.string(),
          paceZone: z.string(),
          targetValue: z.number(),
          targetUnit: z.enum(["seconds", "meters"]),
          repetitions: z.number().optional(),
          restValue: z.number().optional(),
          restUnit: z.enum(["seconds", "meters"]).optional(),
        }),
      ),
    }),
  ),
  strengthWorkouts: z
    .array(
      z.object({
        title: z.string(),
        plannedMinutes: z.number(),
        notes: z.string().optional(),
        exercises: z.array(
          z.object({
            name: z.string(),
            sets: z.number(),
            reps: z.number().optional(),
            holdSeconds: z.number().optional(),
            restSeconds: z.number().optional(),
            equipment: strengthEquipmentSchema.optional(),
            cues: z.string().optional(),
          }),
        ),
      }),
    )
    .optional(),
  coachNotes: z.string(),
});

export const assessmentDraftSchema = z.object({
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
