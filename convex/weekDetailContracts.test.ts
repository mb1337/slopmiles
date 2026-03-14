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
              type: "runWalk",
              volumePercent: 0.08,
              scheduledDate: "2026-03-10",
              venue: "road",
              segments: [
                {
                  label: "3 x (run 4 min / walk 1 min)",
                  paceZone: "E",
                  targetValue: 240,
                  targetUnit: "seconds",
                  repetitions: 3,
                  restValue: 60,
                  restUnit: "seconds",
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

  it("accepts the cruise pace zone in workout segments", () => {
    const validated = validateWeekDetailResponse(
      {
        workouts: [
          {
            type: "longRun",
            volumePercent: 0.35,
            scheduledDate: "2026-03-15",
            venue: "road",
            segments: [
              {
                label: "Steady aerobic",
                paceZone: "C",
                targetValue: 3600,
                targetUnit: "seconds",
              },
            ],
          },
        ],
        coachNotes: "Use the higher end of the aerobic range.",
      },
      {
        weekStartDateKey: "2026-03-09",
        weekEndDateKey: "2026-03-15",
        targetVolumePercent: 0.4,
        preferredRunningDays: ["tuesday", "thursday", "sunday"],
        trackAccess: true,
      },
    );

    expect(validated.proposal.workouts[0]?.segments[0]?.paceZone).toBe("C");
  });

  it("accepts run/walk workouts with walk breaks encoded as rest intervals", () => {
    const validated = validateWeekDetailResponse(
      {
        workouts: [
          {
            type: "runWalk",
            volumePercent: 0.2,
            scheduledDate: "2026-03-10",
            venue: "road",
            notes: "Count the full session time, including walk breaks.",
            segments: [
              {
                label: "6 x (run 3 min / walk 1 min)",
                paceZone: "E",
                targetValue: 180,
                targetUnit: "seconds",
                repetitions: 6,
                restValue: 60,
                restUnit: "seconds",
              },
            ],
          },
        ],
        coachNotes: "Use this to rebuild consistency without forcing continuous running.",
      },
      {
        weekStartDateKey: "2026-03-09",
        weekEndDateKey: "2026-03-15",
        targetVolumePercent: 0.2,
        preferredRunningDays: ["tuesday", "thursday", "sunday"],
        trackAccess: true,
      },
    );

    expect(validated.proposal.workouts[0]?.type).toBe("runWalk");
    expect(validated.proposal.workouts[0]?.segments[0]).toMatchObject({
      repetitions: 6,
      restValue: 60,
      restUnit: "seconds",
    });
  });

  it("accepts speed workouts with repetition-pace segments", () => {
    const validated = validateWeekDetailResponse(
      {
        workouts: [
          {
            type: "speed",
            volumePercent: 0.18,
            scheduledDate: "2026-03-12",
            venue: "track",
            segments: [
              {
                label: "Warmup",
                paceZone: "E",
                targetValue: 900,
                targetUnit: "seconds",
              },
              {
                label: "8 x 200m",
                paceZone: "R",
                targetValue: 200,
                targetUnit: "meters",
                repetitions: 8,
                restValue: 200,
                restUnit: "meters",
              },
            ],
          },
        ],
        coachNotes: "Keep the reps sharp and relaxed.",
      },
      {
        weekStartDateKey: "2026-03-09",
        weekEndDateKey: "2026-03-15",
        targetVolumePercent: 0.2,
        preferredRunningDays: ["tuesday", "thursday", "sunday"],
        trackAccess: true,
      },
    );

    expect(validated.proposal.workouts[0]?.type).toBe("speed");
    expect(validated.proposal.workouts[0]?.segments[1]?.paceZone).toBe("R");
  });
});
