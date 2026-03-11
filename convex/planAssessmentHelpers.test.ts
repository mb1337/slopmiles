import { describe, expect, it } from "vitest";

import { resolvePlanAssessmentState } from "./planAssessmentHelpers";

describe("plan assessment helpers", () => {
  it("prefers persisted assessments over request state", () => {
    const state = resolvePlanAssessmentState({
      planId: "plan-1" as never,
      assessmentByPlanId: new Map([
        [
          "plan-1",
          {
            _id: "assessment-1" as never,
            planId: "plan-1" as never,
            summary: "Ready",
            volumeAdherence: 0.9,
            paceAdherence: 0.8,
            vdotStart: 47,
            vdotEnd: 48,
            highlights: ["Consistency"],
            areasForImprovement: ["Recovery"],
            nextPlanSuggestion: "Keep building.",
            discussionPrompts: ["Next goal?"],
            createdAt: 1,
          },
        ],
      ]),
      requestByPlanId: new Map([
        [
          "plan-1",
          {
            _id: "request-1" as never,
            status: "failed",
            errorMessage: "offline",
            nextRetryAt: undefined,
            createdAt: 1,
            updatedAt: 2,
          },
        ],
      ]),
    });

    expect(state.status).toBe("ready");
    expect(state.assessment?.summary).toBe("Ready");
  });

  it("marks failed requests when no assessment exists", () => {
    const state = resolvePlanAssessmentState({
      planId: "plan-2" as never,
      assessmentByPlanId: new Map(),
      requestByPlanId: new Map([
        [
          "plan-2",
          {
            _id: "request-2" as never,
            status: "failed",
            errorMessage: "timeout",
            nextRetryAt: undefined,
            createdAt: 1,
            updatedAt: 2,
          },
        ],
      ]),
    });

    expect(state.status).toBe("failed");
    expect(state.request?.errorMessage).toBe("timeout");
  });
});
