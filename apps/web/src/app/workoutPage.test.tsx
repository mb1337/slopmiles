// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatResolvedPaceTargetForDisplay } from "@slopmiles/domain";

import { WorkoutPage } from "./pages";
import type { SessionData } from "./session";

const {
  getWorkoutDetailViewToken,
  skipWorkoutToken,
  rescheduleWorkoutToken,
  bumpWorkoutToken,
  mockUseQuery,
  mockUseMutation,
  mockNavigate,
} = vi.hoisted(() => ({
  getWorkoutDetailViewToken: { name: "getWorkoutDetailView" },
  skipWorkoutToken: { name: "skipWorkout" },
  rescheduleWorkoutToken: { name: "rescheduleWorkout" },
  bumpWorkoutToken: { name: "bumpWorkout" },
  mockUseQuery: vi.fn(),
  mockUseMutation: vi.fn(),
  mockNavigate: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
  usePaginatedQuery: vi.fn(),
}));

vi.mock("../convex", () => ({
  api: {
    workoutDetail: {
      getWorkoutDetailView: getWorkoutDetailViewToken,
      skipWorkout: skipWorkoutToken,
      rescheduleWorkout: rescheduleWorkoutToken,
      bumpWorkout: bumpWorkoutToken,
    },
  },
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ workoutId: "workout-1" }),
  };
});

const session = {
  user: {
    unitPreference: "imperial",
  },
} as unknown as SessionData;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildDetail(options: {
  vdotAtGeneration?: number;
  workoutType?: string;
  segments?: Array<{
    label: string;
    paceZone: string;
    targetValue: number;
    targetUnit: "seconds" | "meters";
  }>;
} = {}) {
  const { vdotAtGeneration, workoutType = "tempo", segments } = options;

  return {
    plan: {
      _id: "plan-1",
      goalLabel: "Spring 10K",
      volumeMode: "time",
      peakWeekVolume: 3600,
      weekNumber: 2,
    },
    week: {
      _id: "week-1",
      weekNumber: 2,
      weekStartDateKey: "2026-03-09",
      weekEndDateKey: "2026-03-15",
      vdotAtGeneration,
    },
    workout: {
      _id: "workout-1",
      type: workoutType,
      volumePercent: 0.2,
      absoluteVolume: 1800,
      scheduledDateKey: "2026-03-10",
      venue: "road",
      origin: "planned",
      status: "planned",
      segments:
        segments ?? [
          {
            label: "Warmup",
            paceZone: "E",
            targetValue: 900,
            targetUnit: "seconds" as const,
          },
          {
            label: "Main Set",
            paceZone: "T",
            targetValue: 1200,
            targetUnit: "seconds" as const,
          },
          {
            label: "Aerobic Finish",
            paceZone: "C",
            targetValue: 600,
            targetUnit: "seconds" as const,
          },
          {
            label: "Sharpening",
            paceZone: "5K pace",
            targetValue: 400,
            targetUnit: "meters" as const,
          },
        ],
    },
    executionDetail: null,
    primaryAction: "reviewExecution" as const,
    rescheduleOptions: ["2026-03-11"],
  };
}

afterEach(() => {
  cleanup();
});

describe("WorkoutPage", () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
    mockUseMutation.mockReset();
    mockNavigate.mockReset();
    mockUseMutation.mockImplementation(() => vi.fn());
  });

  it("renders explicit pace targets from the week snapshot", () => {
    mockUseQuery.mockImplementation((token) => {
      if (token === getWorkoutDetailViewToken) {
        return buildDetail({ vdotAtGeneration: 50 });
      }
      return undefined;
    });

    render(<WorkoutPage session={session} />);

    expect(screen.getByText("Workout summary")).toBeInTheDocument();
    expect(screen.getByText("Segments")).toBeInTheDocument();
    expect(
      screen.getByText(
        new RegExp(`Warmup: 15:00 @ E \\(${escapeRegExp(formatResolvedPaceTargetForDisplay(50, "E", "imperial")!)}\\)`),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        new RegExp(`Main Set: 20:00 @ T \\(${escapeRegExp(formatResolvedPaceTargetForDisplay(50, "T", "imperial")!)}\\)`),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        new RegExp(`Aerobic Finish: 10:00 @ C \\(${escapeRegExp(formatResolvedPaceTargetForDisplay(50, "C", "imperial")!)}\\)`),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        new RegExp(`Sharpening: 400m @ 5K pace \\(${escapeRegExp(formatResolvedPaceTargetForDisplay(50, "5K pace", "imperial")!)}\\)`),
      ),
    ).toBeInTheDocument();
  });

  it("keeps legacy workouts label-only when the week snapshot is missing", () => {
    mockUseQuery.mockImplementation((token) => {
      if (token === getWorkoutDetailViewToken) {
        return buildDetail();
      }
      return undefined;
    });

    render(<WorkoutPage session={session} />);

    expect(screen.getByText("Sharpening: 400m @ 5K pace")).toBeInTheDocument();
    expect(screen.queryByText(/5K pace \(/)).not.toBeInTheDocument();
  });

  it("renders speed workout labels and repetition-pace targets", () => {
    mockUseQuery.mockImplementation((token) => {
      if (token === getWorkoutDetailViewToken) {
        return buildDetail({
          vdotAtGeneration: 50,
          workoutType: "speed",
          segments: [
            {
              label: "Warmup",
              paceZone: "E",
              targetValue: 900,
              targetUnit: "seconds",
            },
            {
              label: "Fast Reps",
              paceZone: "R",
              targetValue: 200,
              targetUnit: "meters",
            },
          ],
        });
      }
      return undefined;
    });

    render(<WorkoutPage session={session} />);

    expect(screen.getByRole("heading", { name: "Speed" })).toBeInTheDocument();
    expect(
      screen.getByText(
        new RegExp(`Fast Reps: 200m @ R \\(${escapeRegExp(formatResolvedPaceTargetForDisplay(50, "R", "imperial")!)}\\)`),
      ),
    ).toBeInTheDocument();
  });
});
