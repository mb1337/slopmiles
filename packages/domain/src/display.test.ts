import { describe, expect, it } from "vitest";

import { WORKOUT_TYPES } from "./index";
import {
  formatExecutionActualRepForDisplay,
  formatExecutionPlannedTargetForDisplay,
  formatHeartRateForDisplay,
  formatLinkedWorkoutSummaryForDisplay,
  formatDistanceForDisplay,
  formatDurationClock,
  formatPaceSecondsPerMeterForDisplay,
  formatPaceRangeSecondsPerMeterForDisplay,
  formatResolvedPaceTargetForDisplay,
  formatVolumeForDisplay,
  formatWorkoutMatchStatusLabel,
  formatWorkoutTypeLabel,
  prefersImperialDistance,
} from "./display";

describe("display helpers", () => {
  it("detects imperial locales even with unicode extensions", () => {
    expect(prefersImperialDistance("system", "en-US-u-hc-h12")).toBe(true);
    expect(prefersImperialDistance("system", "en-GB-u-ca-gregory")).toBe(false);
  });

  it("formats long durations with hours", () => {
    expect(formatDurationClock(3723)).toBe("1:02:03");
    expect(formatDurationClock(1500)).toBe("25:00");
  });

  it("guards invalid distances and preserves tiny imperial distances", () => {
    expect(formatDistanceForDisplay(Number.NaN, "metric")).toBe("-");
    expect(formatDistanceForDisplay(10, "imperial")).toBe("<0.01 mi");
    expect(formatDistanceForDisplay(5000, "metric")).toBe("5.00 km");
    expect(formatDistanceForDisplay(1609.344, "imperial")).toBe("1.00 mi");
  });

  it("rounds pace cleanly at minute boundaries", () => {
    expect(formatPaceSecondsPerMeterForDisplay(360 / 1609.344, "imperial")).toBe("6:00 / mi");
  });

  it("formats pace ranges with a single unit suffix", () => {
    expect(
      formatPaceRangeSecondsPerMeterForDisplay(
        [390 / 1609.344, 360 / 1609.344],
        "imperial",
      ),
    ).toBe("6:00-6:30 / mi");
  });

  it("formats resolved VDOT pace targets for supported labels", () => {
    expect(formatResolvedPaceTargetForDisplay(50, "E", "imperial")).toMatch(/^\d+:\d{2} \/ mi$/);
    expect(formatResolvedPaceTargetForDisplay(50, "C", "imperial")).toMatch(/^\d+:\d{2} \/ mi$/);
    expect(formatResolvedPaceTargetForDisplay(50, "T", "imperial")).toMatch(/^\d+:\d{2} \/ mi$/);
    expect(formatResolvedPaceTargetForDisplay(50, "5K pace", "metric")).toMatch(/^\d+:\d{2} \/ km$/);
  });

  it("returns no explicit pace when VDOT or pace labels are unsupported", () => {
    expect(formatResolvedPaceTargetForDisplay(null, "T", "imperial")).toBeNull();
    expect(formatResolvedPaceTargetForDisplay(50, "15K pace", "imperial")).toBeNull();
  });

  it("formats absolute volume by mode", () => {
    expect(formatVolumeForDisplay("time", 1800, "metric")).toBe("30:00");
    expect(formatVolumeForDisplay("distance", 10000, "metric")).toBe("10.00 km");
  });

  it("formats workout labels consistently", () => {
    expect(WORKOUT_TYPES).toContain("speed");
    expect(formatWorkoutTypeLabel("easyRun")).toBe("Easy Run");
    expect(formatWorkoutTypeLabel("runWalk")).toBe("Run/Walk");
    expect(formatWorkoutTypeLabel("speed")).toBe("Speed");
    expect(formatWorkoutTypeLabel("customType")).toBe("Custom Type");
  });

  it("formats execution presenter labels consistently", () => {
    expect(formatWorkoutMatchStatusLabel("matched")).toBe("Matched");
    expect(formatWorkoutMatchStatusLabel("needsReview")).toBe("Needs Review");
    expect(formatWorkoutMatchStatusLabel("unmatched")).toBe("Unplanned");
    expect(formatHeartRateForDisplay(154.6)).toBe("155 bpm");
    expect(formatHeartRateForDisplay(undefined)).toBeNull();
    expect(
      formatLinkedWorkoutSummaryForDisplay({
        scheduledDateKey: "2026-03-09",
        type: "intervals",
      }),
    ).toBe("Mon, Mar 9 · Intervals");
  });

  it("formats planned and actual rep comparisons", () => {
    expect(
      formatExecutionPlannedTargetForDisplay(
        {
          plannedSeconds: null,
          plannedMeters: 400,
          plannedPaceSecondsPerMeter: 0.1875,
        },
        "metric",
      ),
    ).toBe("400 m @ 3:08 / km");
    expect(
      formatExecutionActualRepForDisplay(
        {
          actualSeconds: 76,
          actualMeters: 400,
          actualPaceSecondsPerMeter: 0.19,
          actualPaceSource: "gap",
        },
        "metric",
      ),
    ).toBe("1:16 · 400 m · GAP 3:10 / km");
  });
});
