import { describe, expect, it } from "vitest";

import { validatePlanAssessmentResponse } from "./assessmentContracts";

describe("assessment contracts", () => {
  it("normalizes valid assessment payloads", () => {
    const validated = validatePlanAssessmentResponse({
      summary: "Solid block with consistent volume.",
      volumeAdherence: 0.92,
      paceAdherence: 0.81,
      vdotStart: 47.24,
      vdotEnd: 49.11,
      highlights: ["Long-run consistency", "Tempo progress"],
      areasForImprovement: ["More sleep before workouts"],
      nextPlanSuggestion: "Build another 8-week half-marathon block.",
      discussionPrompts: ["Do you want another race cycle?"],
    });

    expect(validated.proposal.vdotStart).toBe(47.2);
    expect(validated.proposal.vdotEnd).toBe(49.1);
    expect(validated.corrections).toEqual([]);
  });

  it("clamps adherence metrics into the supported range", () => {
    const validated = validatePlanAssessmentResponse({
      summary: "Mixed block.",
      volumeAdherence: 1.4,
      paceAdherence: -0.2,
      vdotStart: 48,
      vdotEnd: 48.5,
      highlights: ["Stayed engaged"],
      areasForImprovement: ["More recovery"],
      nextPlanSuggestion: "Take a down week first.",
      discussionPrompts: ["How much time do you have next month?"],
    });

    expect(validated.proposal.volumeAdherence).toBe(1);
    expect(validated.proposal.paceAdherence).toBe(0);
    expect(validated.corrections).toHaveLength(2);
  });

  it("rejects empty list fields", () => {
    expect(() =>
      validatePlanAssessmentResponse({
        summary: "Incomplete payload.",
        volumeAdherence: 0.5,
        paceAdherence: 0.5,
        vdotStart: 45,
        vdotEnd: 45,
        highlights: [],
        areasForImprovement: ["More sleep"],
        nextPlanSuggestion: "Recover first.",
        discussionPrompts: ["What next?"],
      }),
    ).toThrow("highlights");
  });
});
