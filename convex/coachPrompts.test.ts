import { describe, expect, it } from "vitest";

import { buildPlanGenerationMessages } from "./coachPrompts";

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
});
