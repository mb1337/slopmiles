import { describe, expect, it } from "vitest";

import { formatDistance, formatDuration, formatRaceTime, formatVolume } from "./format";

describe("web format helpers", () => {
  it("formats durations compactly", () => {
    expect(formatDuration(3723)).toBe("1:02:03");
    expect(formatRaceTime(1500)).toBe("25:00");
  });

  it("formats distance in metric or imperial context", () => {
    expect(formatDistance(5000, "metric")).toBe("5.00 km");
    expect(formatDistance(1609.344, "imperial")).toBe("1.00 mi");
  });

  it("formats absolute volume by mode", () => {
    expect(formatVolume("time", 1800, "metric")).toBe("30:00");
    expect(formatVolume("distance", 10000, "metric")).toBe("10.00 km");
  });
});
