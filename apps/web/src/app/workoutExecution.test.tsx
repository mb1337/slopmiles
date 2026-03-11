// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkoutExecutionDetail, WorkoutLapList } from "./workoutExecution";

const {
  getExecutionDetailToken,
  getMatchCandidatesToken,
  submitCheckInToken,
  linkImportedWorkoutToken,
  unlinkImportedWorkoutToken,
  mockUseQuery,
  mockUseMutation,
} = vi.hoisted(() => ({
  getExecutionDetailToken: { name: "getExecutionDetail" },
  getMatchCandidatesToken: { name: "getMatchCandidates" },
  submitCheckInToken: { name: "submitCheckIn" },
  linkImportedWorkoutToken: { name: "linkImportedWorkout" },
  unlinkImportedWorkoutToken: { name: "unlinkImportedWorkout" },
  mockUseQuery: vi.fn(),
  mockUseMutation: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
}));

vi.mock("../convex", () => ({
  api: {
    workoutDetail: {
      getExecutionDetail: getExecutionDetailToken,
      getMatchCandidates: getMatchCandidatesToken,
      submitCheckIn: submitCheckInToken,
      linkImportedWorkout: linkImportedWorkoutToken,
      unlinkImportedWorkout: unlinkImportedWorkoutToken,
    },
  },
}));

type MockExecutionDetail = {
  execution: {
    _id: string;
    matchStatus: "matched" | "unmatched" | "needsReview";
    checkInStatus: "pending" | "submitted";
    rpe: number | null;
    modifiers: Array<
      | "pushedStroller"
      | "ranWithDog"
      | "trailOffRoad"
      | "treadmill"
      | "highAltitude"
      | "poorSleep"
      | "feelingUnwell"
    >;
    customModifierText?: string;
    notes?: string;
    feedback: {
      commentary?: string;
      adjustments: string[];
    };
  };
  importedWorkout: {
    _id: string;
    distanceMeters: number;
    durationSeconds: number;
    rawPaceSecondsPerMeter?: number;
    gradeAdjustedPaceSecondsPerMeter?: number;
    averageHeartRate?: number;
    elevationAscentMeters?: number;
    elevationDescentMeters?: number;
  };
  plannedWorkout: null | {
    _id: string;
    scheduledDateKey: string;
    type: string;
  };
  segmentComparisons: Array<{
    plannedSegmentOrder: number;
    plannedLabel: string;
    plannedPaceZone: string | null;
    adherenceScore: number;
    inferred: boolean;
    reps: Array<{
      repIndex: number;
      plannedSeconds: number | null;
      plannedMeters: number | null;
      plannedPaceSecondsPerMeter: number | null;
      actualSeconds: number | null;
      actualMeters: number | null;
      actualPaceSecondsPerMeter: number | null;
      actualPaceSource: "gap" | "raw" | null;
    }>;
  }>;
};

function buildExecutionDetail(
  overrides: Partial<MockExecutionDetail> = {},
): MockExecutionDetail {
  return {
    execution: {
      _id: "execution-1",
      matchStatus: "matched",
      checkInStatus: "submitted",
      rpe: 7,
      modifiers: ["trailOffRoad"],
      customModifierText: "Windy",
      notes: "Felt solid",
      feedback: {
        commentary: "Nice work holding pace.",
        adjustments: ["Keep the recovery easy tomorrow."],
      },
    },
    importedWorkout: {
      _id: "imported-1",
      distanceMeters: 8000,
      durationSeconds: 2400,
      rawPaceSecondsPerMeter: 0.3,
      gradeAdjustedPaceSecondsPerMeter: 0.29,
      averageHeartRate: 155,
      elevationAscentMeters: 60,
      elevationDescentMeters: 58,
    },
    plannedWorkout: {
      _id: "planned-1",
      scheduledDateKey: "2026-03-09",
      type: "intervals",
    },
    segmentComparisons: [
      {
        plannedSegmentOrder: 1,
        plannedLabel: "400m reps",
        plannedPaceZone: "I",
        adherenceScore: 0.94,
        inferred: true,
        reps: [
          {
            repIndex: 1,
            plannedSeconds: null,
            plannedMeters: 400,
            plannedPaceSecondsPerMeter: 0.1875,
            actualSeconds: 76,
            actualMeters: 400,
            actualPaceSecondsPerMeter: 0.19,
            actualPaceSource: "gap",
          },
        ],
      },
    ],
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe("WorkoutExecutionDetail", () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
    mockUseMutation.mockReset();
  });

  it("renders structured rep detail and inferred messaging", () => {
    const detail = buildExecutionDetail();
    mockUseQuery.mockImplementation((token) => {
      if (token === getExecutionDetailToken) {
        return detail;
      }
      if (token === getMatchCandidatesToken) {
        return [];
      }
      return undefined;
    });
    mockUseMutation.mockImplementation(() => vi.fn());

    render(
      <WorkoutExecutionDetail
        executionId={"execution-1" as never}
        unitPreference="metric"
      />,
    );

    expect(screen.getByText("Planned vs Actual Reps")).toBeInTheDocument();
    expect(screen.getByText(/includes inferred rep boundaries/i)).toBeInTheDocument();
    expect(screen.getByText(/Planned: 400 m/i)).toBeInTheDocument();
    expect(screen.getByText(/Actual: 1:16/i)).toBeInTheDocument();
    expect(screen.getByText("Linked workout")).toBeInTheDocument();
  });

  it("renders unstructured execution detail without rep comparisons", () => {
    const detail = buildExecutionDetail({
      plannedWorkout: null,
      segmentComparisons: [],
      importedWorkout: {
        _id: "imported-1",
        distanceMeters: 5000,
        durationSeconds: 1500,
        rawPaceSecondsPerMeter: 0.3,
      },
      execution: {
        ...buildExecutionDetail().execution,
        matchStatus: "unmatched",
        feedback: {
          commentary: undefined,
          adjustments: [],
        },
      },
    });
    mockUseQuery.mockImplementation((token) => {
      if (token === getExecutionDetailToken) {
        return detail;
      }
      if (token === getMatchCandidatesToken) {
        return [];
      }
      return undefined;
    });
    mockUseMutation.mockImplementation(() => vi.fn());

    render(
      <WorkoutExecutionDetail
        executionId={"execution-1" as never}
        unitPreference="metric"
      />,
    );

    expect(screen.queryByText("Planned vs Actual Reps")).not.toBeInTheDocument();
    expect(screen.getByText("Check-In")).toBeInTheDocument();
    expect(screen.getByText("Coach feedback pending.")).toBeInTheDocument();
  });

  it("renders match candidates when match controls are enabled", () => {
    const detail = buildExecutionDetail({
      execution: {
        ...buildExecutionDetail().execution,
        matchStatus: "needsReview",
      },
    });
    mockUseQuery.mockImplementation((token) => {
      if (token === getExecutionDetailToken) {
        return detail;
      }
      if (token === getMatchCandidatesToken) {
        return [
          {
            plannedWorkoutId: "planned-2",
            scheduledDateKey: "2026-03-10",
            type: "tempo",
            confidence: 0.88,
            weekNumber: 4,
          },
        ];
      }
      return undefined;
    });
    mockUseMutation.mockImplementation(() => vi.fn());

    render(
      <WorkoutExecutionDetail
        allowMatchControls
        executionId={"execution-1" as never}
        unitPreference="metric"
      />,
    );

    expect(screen.getByText("Plan Match")).toBeInTheDocument();
    expect(screen.getByText(/Confidence 88% · Week 4/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Link to Planned Workout" })).toBeInTheDocument();
  });

  it("hides optional metrics when they are unavailable", () => {
    const detail = buildExecutionDetail({
      importedWorkout: {
        _id: "imported-1",
        distanceMeters: 5000,
        durationSeconds: 1500,
        rawPaceSecondsPerMeter: 0.3,
      },
    });
    mockUseQuery.mockImplementation((token) => {
      if (token === getExecutionDetailToken) {
        return detail;
      }
      if (token === getMatchCandidatesToken) {
        return [];
      }
      return undefined;
    });
    mockUseMutation.mockImplementation(() => vi.fn());

    render(
      <WorkoutExecutionDetail
        executionId={"execution-1" as never}
        unitPreference="metric"
      />,
    );

    expect(screen.queryByText("GAP")).not.toBeInTheDocument();
    expect(screen.queryByText("Avg HR")).not.toBeInTheDocument();
    expect(screen.queryByText("Elevation")).not.toBeInTheDocument();
  });

  it("submits updated check-in details", async () => {
    const submitCheckIn = vi.fn().mockResolvedValue(undefined);
    const detail = buildExecutionDetail();
    mockUseQuery.mockImplementation((token) => {
      if (token === getExecutionDetailToken) {
        return detail;
      }
      if (token === getMatchCandidatesToken) {
        return [];
      }
      return undefined;
    });
    mockUseMutation.mockImplementation((token) => {
      if (token === submitCheckInToken) {
        return submitCheckIn;
      }
      return vi.fn();
    });

    render(
      <WorkoutExecutionDetail
        executionId={"execution-1" as never}
        unitPreference="metric"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "8" }));
    fireEvent.click(screen.getByRole("button", { name: "Update Check-In" }));

    expect(submitCheckIn).toHaveBeenCalledWith(
      expect.objectContaining({
        executionId: "execution-1",
        rpe: 8,
      }),
    );
  });
});

describe("WorkoutLapList", () => {
  it("renders history lap rows from imported intervals", () => {
    render(
      <WorkoutLapList
        intervals={[
          {
            startedAt: 1,
            endedAt: 2,
            durationSeconds: 90,
            distanceMeters: 400,
            rawPaceSecondsPerMeter: 0.225,
          },
          {
            startedAt: 3,
            endedAt: 4,
            durationSeconds: 120,
            distanceMeters: 500,
            rawPaceSecondsPerMeter: 0.24,
          },
        ]}
        unitPreference="imperial"
      />,
    );

    expect(screen.getByText("Lap 1")).toBeInTheDocument();
    expect(screen.getByText("Lap 2")).toBeInTheDocument();
    expect(screen.getAllByText(/Pace /i)).toHaveLength(2);
  });
});
