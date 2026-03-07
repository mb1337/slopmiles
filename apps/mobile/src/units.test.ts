import { describe, expect, it } from "vitest";

import { formatPaceSecondsPerMeterForDisplay } from "./units";

describe("formatPaceSecondsPerMeterForDisplay", () => {
  it("rolls rounded seconds into the next minute instead of emitting :60", () => {
    const display = formatPaceSecondsPerMeterForDisplay(360 / 1609.344, "imperial");
    expect(display).toBe("6:00 / mi");
  });
});
