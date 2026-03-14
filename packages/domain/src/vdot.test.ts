import { describe, expect, it } from "vitest";

import {
  calculatePacesFromVdot,
  resolveRepresentativePaceSecondsPerMeterFromVdot,
  vdotCruisePace,
} from "./vdot";

describe("vdot pace resolution", () => {
  it("returns single paces for all supported training zones including cruise", () => {
    const paces = calculatePacesFromVdot(50);

    expect(paces.C).toBeGreaterThan(0);
    expect(paces.E).toBeGreaterThan(paces.C);
    expect(resolveRepresentativePaceSecondsPerMeterFromVdot(50, "E")).toBeCloseTo(paces.E, 10);
    expect(resolveRepresentativePaceSecondsPerMeterFromVdot(50, "C")).toBeCloseTo(paces.C, 10);
    expect(vdotCruisePace(50)).toBeCloseTo(paces.C, 10);
  });
});
