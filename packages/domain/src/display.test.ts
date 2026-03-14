import { describe, expect, it } from "vitest";

import {
  formatDistanceForDisplay,
  formatDurationClock,
  formatPaceSecondsPerMeterForDisplay,
  formatPaceRangeSecondsPerMeterForDisplay,
  formatResolvedPaceTargetForDisplay,
  formatVolumeForDisplay,
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
    expect(formatWorkoutTypeLabel("easyRun")).toBe("Easy Run");
    expect(formatWorkoutTypeLabel("runWalk")).toBe("Run/Walk");
    expect(formatWorkoutTypeLabel("customType")).toBe("Custom Type");
  });
});
