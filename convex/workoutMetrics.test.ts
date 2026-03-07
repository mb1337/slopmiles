import { describe, expect, it } from "vitest";

import {
  buildStructuredSegmentComparisons,
  resolveActualPaceMetrics,
  resolvePlannedPaceSecondsPerMeter,
} from "./workoutMetrics";

describe("workout metrics", () => {
  it("builds rep comparisons for exact interval counts", () => {
    const comparisons = buildStructuredSegmentComparisons({
      currentVdot: 50,
      segments: [
        {
          order: 2,
          label: "Main Set",
          paceZone: "10K pace",
          targetValue: 300,
          targetUnit: "seconds",
          repetitions: 2,
        },
      ],
      intervals: [
        {
          startedAt: 0,
          endedAt: 300_000,
          durationSeconds: 300,
          distanceMeters: 1500,
          rawPaceSecondsPerMeter: 0.2,
          gradeAdjustedPaceSecondsPerMeter: 0.195,
        },
        {
          startedAt: 360_000,
          endedAt: 660_000,
          durationSeconds: 300,
          distanceMeters: 1480,
          rawPaceSecondsPerMeter: 0.203,
        },
      ],
    });

    expect(comparisons).toHaveLength(1);
    expect(comparisons[0]?.reps).toHaveLength(2);
    expect(comparisons[0]?.reps[0]?.actualPaceSource).toBe("gap");
    expect(comparisons[0]?.reps[1]?.actualPaceSource).toBe("raw");
  });

  it("marks missing reps as inferred", () => {
    const comparisons = buildStructuredSegmentComparisons({
      currentVdot: 50,
      segments: [
        {
          order: 2,
          label: "Main Set",
          paceZone: "5K pace",
          targetValue: 400,
          targetUnit: "meters",
          repetitions: 3,
        },
      ],
      intervals: [
        {
          startedAt: 0,
          endedAt: 80_000,
          durationSeconds: 80,
          distanceMeters: 400,
          rawPaceSecondsPerMeter: 0.2,
        },
        {
          startedAt: 100_000,
          endedAt: 182_000,
          durationSeconds: 82,
          distanceMeters: 400,
          rawPaceSecondsPerMeter: 0.205,
        },
      ],
    });

    expect(comparisons[0]?.reps[2]?.inferred).toBe(true);
    expect(comparisons[0]?.inferred).toBe(true);
  });

  it("appends extra reps as inferred rows", () => {
    const comparisons = buildStructuredSegmentComparisons({
      currentVdot: 50,
      segments: [
        {
          order: 2,
          label: "Main Set",
          paceZone: "5K pace",
          targetValue: 400,
          targetUnit: "meters",
          repetitions: 1,
        },
      ],
      intervals: [
        {
          startedAt: 0,
          endedAt: 80_000,
          durationSeconds: 80,
          distanceMeters: 400,
          rawPaceSecondsPerMeter: 0.2,
        },
        {
          startedAt: 100_000,
          endedAt: 182_000,
          durationSeconds: 82,
          distanceMeters: 400,
          rawPaceSecondsPerMeter: 0.205,
        },
      ],
    });

    expect(comparisons[0]?.reps).toHaveLength(2);
    expect(comparisons[0]?.reps[1]?.inferred).toBe(true);
  });

  it("returns null for unknown pace labels", () => {
    expect(resolvePlannedPaceSecondsPerMeter(50, "15K pace")).toBeNull();
  });

  it("prefers GAP over raw pace in actual pace metrics", () => {
    const metrics = resolveActualPaceMetrics({
      rawPaceSecondsPerMeter: 0.21,
      gradeAdjustedPaceSecondsPerMeter: 0.2,
    });

    expect(metrics.preferredPaceSecondsPerMeter).toBe(0.2);
    expect(metrics.preferredPaceSource).toBe("gap");
    expect(metrics.hasMeaningfulGapDifference).toBe(true);
  });
});
