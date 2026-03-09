import { describe, expect, it } from "vitest";

import { validateWeekDetailResponse } from "./weekDetailContracts";

describe("week detail contracts", () => {
  it("keeps generated volume at or below the remaining target for constrained weeks", () => {
    const validated = validateWeekDetailResponse(
      {
        workouts: [
          {
            type: "tempo",
            volumePercent: 0.35,
            scheduledDate: "2026-03-12",
            venue: "road",
            segments: [
              {
                label: "Tempo block",
                paceZone: "T",
                targetValue: 1800,
                targetUnit: "seconds",
              },
            ],
          },
        ],
        strengthWorkouts: [
          {
            title: "Band circuit",
            plannedMinutes: 20,
            exercises: [
              {
                name: "Split squat",
                sets: 3,
                reps: 8,
                equipment: "bands",
              },
            ],
          },
        ],
        coachNotes: "Travel week, so keep the load trimmed.",
      },
      {
        weekStartDateKey: "2026-03-09",
        weekEndDateKey: "2026-03-15",
        targetVolumePercent: 0.5,
        preferredRunningDays: ["tuesday", "thursday", "sunday"],
        trackAccess: true,
        lockedWorkouts: [
          {
            type: "easyRun",
            volumePercent: 0.2,
            scheduledDate: "2026-03-10",
            venue: "road",
            segments: [],
          },
        ],
        volumeTargetMode: "upToTarget",
      },
    );

    expect(validated.proposal.workouts[0]?.volumePercent).toBe(0.3);
    expect(validated.proposal.strengthWorkouts).toHaveLength(1);
    expect(validated.corrections).toContain(
      "Reduced generated workout volume percentages to stay within the remaining week target.",
    );
  });

  it("rejects more than two workouts on one day including locked workouts", () => {
    expect(() =>
      validateWeekDetailResponse(
        {
          workouts: [
            {
              type: "tempo",
              volumePercent: 0.15,
              scheduledDate: "2026-03-10",
              venue: "road",
              segments: [
                {
                  label: "Tempo block",
                  paceZone: "T",
                  targetValue: 1200,
                  targetUnit: "seconds",
                },
              ],
            },
            {
              type: "recovery",
              volumePercent: 0.08,
              scheduledDate: "2026-03-10",
              venue: "road",
              segments: [
                {
                  label: "Jog",
                  paceZone: "E",
                  targetValue: 900,
                  targetUnit: "seconds",
                },
              ],
            },
          ],
          coachNotes: "Too many workouts on one day.",
        },
        {
          weekStartDateKey: "2026-03-09",
          weekEndDateKey: "2026-03-15",
          targetVolumePercent: 0.6,
          preferredRunningDays: ["tuesday", "thursday", "sunday"],
          trackAccess: true,
          lockedWorkouts: [
            {
              type: "easyRun",
              volumePercent: 0.12,
              scheduledDate: "2026-03-10",
              venue: "road",
              segments: [],
            },
          ],
        },
      ),
    ).toThrow("More than two workouts were scheduled on 2026-03-10.");
  });
});
