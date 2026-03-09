import { describe, expect, it } from "vitest";

import { buildPlanGenerationMessages, buildWeekDetailGenerationMessages } from "./coachPrompts";

describe("coach prompts", () => {
  it("includes strength preferences in the plan-generation payload", () => {
    const messages = buildPlanGenerationMessages({
      goalType: "race",
      goalLabel: "Half Marathon",
      targetDate: Date.UTC(2026, 8, 20),
      goalTimeSeconds: 5400,
      volumeMode: "time",
      authoritativeNumberOfWeeks: 12,
      requestedNumberOfWeeks: undefined,
      includeStrength: true,
      strengthEquipment: ["bodyweight", "bands"],
      competitiveness: "balanced",
      personalityDescription: "Brief, direct, no fluff.",
      unitPreference: "imperial",
      scheduleConstraints: {
        targetRunningDaysPerWeek: 5,
        availableDaysPerWeek: 6,
      },
      currentVDOT: 48,
      recentWorkouts: [],
    });

    const userPayload = JSON.parse(String(messages[1]?.content));

    expect(userPayload.planning.includeStrength).toBe(true);
    expect(userPayload.planning.strengthEquipment).toEqual(["bodyweight", "bands"]);
    expect(userPayload.responseRequirements.keysRequired).toContain("rationale");
  });

  it("includes adaptive week inputs in the week-detail payload", () => {
    const messages = buildWeekDetailGenerationMessages({
      goalLabel: "Half Marathon",
      volumeMode: "time",
      peakWeekVolume: 540,
      currentVDOT: 48,
      competitiveness: "balanced",
      personalityDescription: "Brief, direct, no fluff.",
      preferredRunningDays: ["tuesday", "thursday", "saturday", "sunday"],
      preferredLongRunDay: "sunday",
      preferredQualityDays: ["tuesday", "thursday"],
      trackAccess: true,
      weekNumber: 5,
      weekStartDateKey: "2026-03-09",
      weekEndDateKey: "2026-03-15",
      targetVolumePercent: 0.82,
      targetVolumeAbsolute: 26568,
      recentWorkouts: [],
      availabilityOverride: {
        preferredRunningDays: ["tuesday", "friday", "sunday"],
        note: "Travel Wed-Thu",
      },
      interruption: {
        type: "travel",
        note: "Conference block",
      },
      races: [
        {
          label: "Spring 10K",
          plannedDate: Date.UTC(2026, 2, 14),
          distanceMeters: 10000,
          goalTimeSeconds: 2700,
          isPrimaryGoal: false,
        },
      ],
      includeStrength: true,
      strengthEquipment: ["bodyweight", "bands"],
      strengthApproach: "Short maintenance work on hard days.",
      lockedRunningWorkouts: [
        {
          type: "easyRun",
          volumePercent: 0.12,
          scheduledDate: "2026-03-10",
          venue: "road",
        },
      ],
      volumeTargetMode: "upToTarget",
    });

    const userPayload = JSON.parse(String(messages[1]?.content));

    expect(userPayload.schedule.availabilityOverride.note).toBe("Travel Wed-Thu");
    expect(userPayload.constraints.races).toHaveLength(1);
    expect(userPayload.constraints.lockedRunningWorkouts).toHaveLength(1);
    expect(userPayload.strength.includeStrength).toBe(true);
    expect(userPayload.responseRequirements.strengthRule).toContain("strengthWorkouts");
  });
});
