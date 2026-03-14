import { describe, expect, it } from "vitest";

import { buildPlanAssessmentMessages, buildPlanGenerationMessages, buildWeekDetailGenerationMessages } from "./coachPrompts";

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
      emphasis: "Threshold focus with weekend race sharpening.",
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
    expect(userPayload.responseRequirements.allowedWorkoutTypes).toEqual([
      "easyRun",
      "runWalk",
      "longRun",
      "tempo",
      "intervals",
      "speed",
    ]);
    expect(userPayload.responseRequirements.runWalkRule).toContain("Standard low-intensity days should be easyRun");
    expect(userPayload.responseRequirements.speedRule).toContain('"R" pace');
    expect(userPayload.responseRequirements.strengthRule).toContain("strengthWorkouts");
    expect(userPayload.responseRequirements.paceZoneRule).toContain('"C"');
    expect(userPayload.responseRequirements.segmentRule).toContain('Choose "E" or "C" explicitly');
  });

  it("includes assessment inputs and required response keys", () => {
    const messages = buildPlanAssessmentMessages({
      goalLabel: "Half Marathon",
      planStatus: "completed",
      completionStyle: "full",
      volumeMode: "time",
      peakWeekVolume: 540,
      competitiveness: "balanced",
      personalityDescription: "Brief, direct, no fluff.",
      currentVDOT: 49.2,
      weeks: [
        {
          weekNumber: 1,
          emphasis: "Base",
          targetVolumeAbsolute: 18000,
          plannedWorkoutCount: 4,
          completedWorkoutCount: 4,
          actualCompletedVolume: 17600,
        },
      ],
      detailWeeks: [
        {
          weekNumber: 1,
          emphasis: "Base",
          workouts: [
            {
              type: "easyRun",
              scheduledDateKey: "2026-03-10",
              status: "completed",
              absoluteVolume: 3600,
              executed: true,
              actualDurationSeconds: 3540,
            },
          ],
        },
      ],
      peakVolumeChanges: [],
      goalChanges: [],
      races: [],
    });

    const userPayload = JSON.parse(String(messages[1]?.content));

    expect(userPayload.plan.completionStyle).toBe("full");
    expect(userPayload.weekSummaries).toHaveLength(1);
    expect(userPayload.responseRequirements.requiredKeys).toContain("summary");
    expect(userPayload.responseRequirements.requiredKeys).toContain("discussionPrompts");
  });
});
