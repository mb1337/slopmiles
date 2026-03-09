import { describe, expect, it } from "vitest";

import { buildMarkerBoundedIntervals } from "./intervalMarkers";

describe("interval markers", () => {
  it("builds workout edge intervals around markers", () => {
    expect(
      buildMarkerBoundedIntervals({
        workoutStartedAt: 500,
        workoutEndedAt: 4_500,
        markerTimestamps: [3_000, 1_000, 4_000, 2_000],
      }),
    ).toEqual([
      { startedAt: 500, endedAt: 1_000 },
      { startedAt: 1_000, endedAt: 2_000 },
      { startedAt: 2_000, endedAt: 3_000 },
      { startedAt: 3_000, endedAt: 4_000 },
      { startedAt: 4_000, endedAt: 4_500 },
    ]);
  });

  it("drops duplicate markers that would create zero-length intervals", () => {
    expect(
      buildMarkerBoundedIntervals({
        workoutStartedAt: 500,
        workoutEndedAt: 2_500,
        markerTimestamps: [1_000, 1_000],
      }),
    ).toEqual([
      { startedAt: 500, endedAt: 1_000 },
      { startedAt: 1_000, endedAt: 2_500 },
    ]);
  });

  it("returns the full workout span when there are no markers", () => {
    expect(
      buildMarkerBoundedIntervals({
        workoutStartedAt: 500,
        workoutEndedAt: 2_500,
        markerTimestamps: [],
      }),
    ).toEqual([{ startedAt: 500, endedAt: 2_500 }]);
  });

  it("can collapse to a single full-workout interval when markers only hit the boundaries", () => {
    expect(
      buildMarkerBoundedIntervals({
        workoutStartedAt: 500,
        workoutEndedAt: 2_500,
        markerTimestamps: [500, 2_500],
      }),
    ).toEqual([{ startedAt: 500, endedAt: 2_500 }]);
  });
});
