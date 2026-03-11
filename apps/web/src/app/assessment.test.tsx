// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PlanAssessmentSummary } from "./assessment";

describe("PlanAssessmentSummary", () => {
  it("renders a structured assessment", () => {
    render(
      <PlanAssessmentSummary
        state={{
          status: "ready",
          request: null,
          assessment: {
            _id: "assessment-1",
            planId: "plan-1",
            summary: "Strong finish.",
            volumeAdherence: 0.91,
            paceAdherence: 0.84,
            vdotStart: 47.2,
            vdotEnd: 49.1,
            highlights: ["Good long runs"],
            areasForImprovement: ["Recover better"],
            nextPlanSuggestion: "Take a down week, then rebuild.",
            discussionPrompts: ["Do you want to race again soon?"],
            createdAt: 1,
          },
        }}
      />,
    );

    expect(screen.getByText("Strong finish.")).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
    expect(screen.getByText("Good long runs")).toBeInTheDocument();
    expect(screen.getByText("Take a down week, then rebuild.")).toBeInTheDocument();
  });

  it("exposes retry affordance for failed states", () => {
    const onRetry = vi.fn();

    render(
      <PlanAssessmentSummary
        state={{
          status: "failed",
          assessment: null,
          request: {
            _id: "request-1",
            status: "failed",
            errorMessage: "Timed out",
            createdAt: 1,
            updatedAt: 2,
          },
        }}
        onRetry={onRetry}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Retry assessment" }));
    expect(onRetry).toHaveBeenCalledWith("request-1");
  });
});
