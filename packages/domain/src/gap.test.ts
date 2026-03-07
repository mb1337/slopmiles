import { describe, expect, it } from "vitest";

import {
  aggregateGapMicroSegmentsForInterval,
  analyzeRouteForGap,
  calculateGradeAdjustedPace,
  calculateMinettiCost,
} from "./gap";

describe("gap utilities", () => {
  it("keeps flat route GAP equal to raw pace", () => {
    const analysis = analyzeRouteForGap([
      {
        latitude: 41,
        longitude: -87,
        altitudeMeters: 200,
        timestampMs: 0,
      },
      {
        latitude: 41,
        longitude: -86.9988,
        altitudeMeters: 200,
        timestampMs: 60_000,
      },
      {
        latitude: 41,
        longitude: -86.9976,
        altitudeMeters: 200,
        timestampMs: 120_000,
      },
    ]);

    expect(analysis).not.toBeNull();
    expect(analysis?.gradeAdjustedPaceSecondsPerMeter).toBeCloseTo(analysis?.rawPaceSecondsPerMeter ?? 0, 6);
    expect(analysis?.equivalentFlatDistanceMeters).toBeCloseTo(analysis?.microSegments.reduce((sum, segment) => sum + segment.distanceMeters, 0) ?? 0, 6);
    expect(analysis?.elevationAscentMeters).toBeCloseTo(0, 6);
    expect(analysis?.elevationDescentMeters).toBeCloseTo(0, 6);
  });

  it("makes uphill GAP faster than raw pace", () => {
    const rawPace = 0.36;
    const uphillGap = calculateGradeAdjustedPace(rawPace, 0.08);
    expect(uphillGap).toBeLessThan(rawPace);
  });

  it("makes downhill GAP slower than raw pace", () => {
    const rawPace = 0.36;
    const downhillGap = calculateGradeAdjustedPace(rawPace, -0.1);
    expect(downhillGap).toBeGreaterThan(rawPace);
  });

  it("makes balanced uphill and downhill cost faster than raw pace overall", () => {
    const aggregate = aggregateGapMicroSegmentsForInterval(
      [
        {
          startedAt: 0,
          endedAt: 60_000,
          distanceMeters: 100,
          durationSeconds: 60,
          rawPaceSecondsPerMeter: 0.6,
          gradeAdjustedPaceSecondsPerMeter: 0.6,
          grade: 0.1,
          elevationGainMeters: 10,
          elevationLossMeters: 0,
        },
        {
          startedAt: 60_000,
          endedAt: 120_000,
          distanceMeters: 100,
          durationSeconds: 60,
          rawPaceSecondsPerMeter: 0.6,
          gradeAdjustedPaceSecondsPerMeter: 0.6,
          grade: -0.1,
          elevationGainMeters: 0,
          elevationLossMeters: 10,
        },
      ],
      0,
      120_000,
    );

    expect(aggregate).not.toBeNull();
    expect(aggregate?.rawPaceSecondsPerMeter).toBeCloseTo(0.6, 6);
    expect(aggregate?.equivalentFlatDistanceMeters ?? 0).toBeGreaterThan(200);
    expect((aggregate?.gradeAdjustedPaceSecondsPerMeter ?? 0) < (aggregate?.rawPaceSecondsPerMeter ?? 0)).toBe(true);
  });

  it("smooths altitude spikes before computing GAP", () => {
    const analysis = analyzeRouteForGap([
      {
        latitude: 41,
        longitude: -87,
        altitudeMeters: 100,
        timestampMs: 0,
      },
      {
        latitude: 41,
        longitude: -86.9995,
        altitudeMeters: 500,
        timestampMs: 20_000,
      },
      {
        latitude: 41,
        longitude: -86.999,
        altitudeMeters: 101,
        timestampMs: 40_000,
      },
      {
        latitude: 41,
        longitude: -86.9985,
        altitudeMeters: 102,
        timestampMs: 60_000,
      },
      {
        latitude: 41,
        longitude: -86.998,
        altitudeMeters: 103,
        timestampMs: 80_000,
      },
    ]);

    expect(analysis).not.toBeNull();
    expect(analysis?.elevationAscentMeters ?? 0).toBeLessThan(25);
    expect(analysis?.elevationDescentMeters ?? 0).toBeLessThan(25);
  });

  it("smooths a flat tail when terminal vertical accuracy degrades", () => {
    const analysis = analyzeRouteForGap(
      [
        {
          latitude: 41,
          longitude: -87,
          altitudeMeters: 100,
          timestampMs: 0,
          distanceFromPreviousMeters: 0,
          horizontalAccuracyMeters: 5,
          verticalAccuracyMeters: 3,
        },
        {
          latitude: 41,
          longitude: -86.9997,
          altitudeMeters: 100,
          timestampMs: 15_000,
          distanceFromPreviousMeters: 30,
          horizontalAccuracyMeters: 5,
          verticalAccuracyMeters: 3,
        },
        {
          latitude: 41,
          longitude: -86.9994,
          altitudeMeters: 100,
          timestampMs: 30_000,
          distanceFromPreviousMeters: 30,
          horizontalAccuracyMeters: 5,
          verticalAccuracyMeters: 3,
        },
        {
          latitude: 41,
          longitude: -86.9991,
          altitudeMeters: 100,
          timestampMs: 45_000,
          distanceFromPreviousMeters: 30,
          horizontalAccuracyMeters: 5,
          verticalAccuracyMeters: 3,
        },
        {
          latitude: 41,
          longitude: -86.9988,
          altitudeMeters: 95,
          timestampMs: 60_000,
          distanceFromPreviousMeters: 30,
          horizontalAccuracyMeters: 12,
          verticalAccuracyMeters: 18,
        },
        {
          latitude: 41,
          longitude: -86.9985,
          altitudeMeters: 90,
          timestampMs: 75_000,
          distanceFromPreviousMeters: 30,
          horizontalAccuracyMeters: 18,
          verticalAccuracyMeters: 20,
        },
      ],
      {
        forceClosedLoop: true,
      },
    );

    expect(analysis).not.toBeNull();
    expect(analysis?.elevationDescentMeters ?? 0).toBeLessThan(1);
    expect(analysis?.gradeAdjustedPaceSecondsPerMeter).toBeCloseTo(analysis?.rawPaceSecondsPerMeter ?? 0, 6);
  });

  it("does not let a noisy terminal altitude erase a real climb on an open route", () => {
    const analysis = analyzeRouteForGap([
      {
        latitude: 41,
        longitude: -87,
        altitudeMeters: 100,
        timestampMs: 0,
        distanceFromPreviousMeters: 0,
        horizontalAccuracyMeters: 5,
        verticalAccuracyMeters: 3,
      },
      {
        latitude: 41,
        longitude: -86.9997,
        altitudeMeters: 104,
        timestampMs: 15_000,
        distanceFromPreviousMeters: 30,
        horizontalAccuracyMeters: 5,
        verticalAccuracyMeters: 3,
      },
      {
        latitude: 41,
        longitude: -86.9994,
        altitudeMeters: 108,
        timestampMs: 30_000,
        distanceFromPreviousMeters: 30,
        horizontalAccuracyMeters: 5,
        verticalAccuracyMeters: 3,
      },
      {
        latitude: 41,
        longitude: -86.9991,
        altitudeMeters: 110,
        timestampMs: 45_000,
        distanceFromPreviousMeters: 30,
        horizontalAccuracyMeters: 5,
        verticalAccuracyMeters: 3,
      },
      {
        latitude: 41,
        longitude: -86.9988,
        altitudeMeters: 110,
        timestampMs: 60_000,
        distanceFromPreviousMeters: 30,
        horizontalAccuracyMeters: 6,
        verticalAccuracyMeters: 4,
      },
      {
        latitude: 41,
        longitude: -86.9985,
        altitudeMeters: 104,
        timestampMs: 75_000,
        distanceFromPreviousMeters: 30,
        horizontalAccuracyMeters: 15,
        verticalAccuracyMeters: 18,
      },
      {
        latitude: 41,
        longitude: -86.9982,
        altitudeMeters: 100,
        timestampMs: 90_000,
        distanceFromPreviousMeters: 30,
        horizontalAccuracyMeters: 20,
        verticalAccuracyMeters: 20,
      },
    ]);

    expect(analysis).not.toBeNull();
    expect(analysis?.elevationAscentMeters ?? 0).toBeGreaterThan(5);
    expect(analysis?.elevationDescentMeters ?? 0).toBeCloseTo(0, 6);
    expect((analysis?.gradeAdjustedPaceSecondsPerMeter ?? 0) < (analysis?.rawPaceSecondsPerMeter ?? 0)).toBe(true);
  });

  it("returns null when there are not enough usable route points", () => {
    const analysis = analyzeRouteForGap([
      {
        latitude: 41,
        longitude: -87,
        altitudeMeters: 100,
        timestampMs: 0,
      },
      {
        latitude: 41,
        longitude: -87,
        altitudeMeters: 101,
        timestampMs: 10_000,
      },
    ]);

    expect(analysis).toBeNull();
  });

  it("rejects route points with negative accuracy values", () => {
    const analysis = analyzeRouteForGap([
      {
        latitude: 41,
        longitude: -87,
        altitudeMeters: 100,
        timestampMs: 0,
        horizontalAccuracyMeters: 5,
        verticalAccuracyMeters: 3,
      },
      {
        latitude: 41,
        longitude: -86.9997,
        altitudeMeters: 101,
        timestampMs: 15_000,
        distanceFromPreviousMeters: 30,
        horizontalAccuracyMeters: -1,
        verticalAccuracyMeters: 3,
      },
      {
        latitude: 41,
        longitude: -87,
        altitudeMeters: 100,
        timestampMs: 30_000,
        horizontalAccuracyMeters: 5,
        verticalAccuracyMeters: 3,
      },
    ]);

    expect(analysis).toBeNull();
  });

  it("keeps GAP close to raw pace for mostly flat routes when HealthKit provides per-hop distance", () => {
    const analysis = analyzeRouteForGap([
      {
        latitude: 41,
        longitude: -87,
        altitudeMeters: 200,
        timestampMs: 0,
      },
      {
        latitude: 41,
        longitude: -86.9997,
        altitudeMeters: 200.4,
        timestampMs: 15_000,
        distanceFromPreviousMeters: 60,
      },
      {
        latitude: 41,
        longitude: -86.9994,
        altitudeMeters: 199.9,
        timestampMs: 30_000,
        distanceFromPreviousMeters: 60,
      },
      {
        latitude: 41,
        longitude: -86.9991,
        altitudeMeters: 200.3,
        timestampMs: 45_000,
        distanceFromPreviousMeters: 60,
      },
      {
        latitude: 41,
        longitude: -86.9988,
        altitudeMeters: 200.1,
        timestampMs: 60_000,
        distanceFromPreviousMeters: 60,
      },
    ]);

    expect(analysis).not.toBeNull();
    const ratio =
      Math.abs((analysis?.gradeAdjustedPaceSecondsPerMeter ?? 0) - (analysis?.rawPaceSecondsPerMeter ?? 0)) /
      (analysis?.rawPaceSecondsPerMeter ?? 1);
    expect(ratio).toBeLessThan(0.03);
  });

  it("aggregates micro segments into interval GAP", () => {
    const aggregate = aggregateGapMicroSegmentsForInterval(
      [
        {
          startedAt: 0,
          endedAt: 60_000,
          distanceMeters: 100,
          durationSeconds: 60,
          rawPaceSecondsPerMeter: 0.6,
          gradeAdjustedPaceSecondsPerMeter: 0.55,
          grade: 0.05,
          elevationGainMeters: 6,
          elevationLossMeters: 0,
        },
        {
          startedAt: 60_000,
          endedAt: 120_000,
          distanceMeters: 100,
          durationSeconds: 60,
          rawPaceSecondsPerMeter: 0.6,
          gradeAdjustedPaceSecondsPerMeter: 0.65,
          grade: -0.04,
          elevationGainMeters: 0,
          elevationLossMeters: 4,
        },
      ],
      30_000,
      120_000,
    );

    expect(aggregate).not.toBeNull();
    expect(aggregate?.distanceMeters ?? 0).toBeCloseTo(150, 6);
    expect(aggregate?.gradeAdjustedPaceSecondsPerMeter ?? 0).toBeGreaterThan(0);
    expect(aggregate?.equivalentFlatDistanceMeters ?? 0).toBeGreaterThan(0);
    expect(aggregate?.elevationGainMeters ?? 0).toBeCloseTo(3, 6);
    expect(aggregate?.elevationLossMeters ?? 0).toBeCloseTo(4, 6);
  });

  it("computes interval GAP from analyzed route segments", () => {
    const analysis = analyzeRouteForGap([
      {
        latitude: 41,
        longitude: -87,
        altitudeMeters: 100,
        timestampMs: 0,
      },
      {
        latitude: 41,
        longitude: -86.999,
        altitudeMeters: 101,
        timestampMs: 60_000,
      },
      {
        latitude: 41,
        longitude: -86.998,
        altitudeMeters: 110,
        timestampMs: 120_000,
      },
    ]);

    expect(analysis).not.toBeNull();
    const aggregate = aggregateGapMicroSegmentsForInterval(analysis?.microSegments ?? [], 30_000, 120_000);
    expect(aggregate).not.toBeNull();
    expect(aggregate?.distanceMeters ?? 0).toBeGreaterThan(0);
    expect(aggregate?.gradeAdjustedPaceSecondsPerMeter ?? 0).toBeGreaterThan(0);
  });

  it("accumulates short route hops instead of dropping them", () => {
    const analysis = analyzeRouteForGap([
      {
        latitude: 41,
        longitude: -87,
        altitudeMeters: 100,
        timestampMs: 0,
      },
      ...Array.from({ length: 50 }, (_, index) => ({
        latitude: 41,
        longitude: -87 + (index + 1) * 0.00003,
        altitudeMeters: 100 + ((index + 1) % 6 === 0 ? 0.3 : 0),
        timestampMs: (index + 1) * 1000,
        distanceFromPreviousMeters: 2.5,
        horizontalAccuracyMeters: 5,
        verticalAccuracyMeters: 3,
      })),
    ]);

    expect(analysis).not.toBeNull();
    expect(analysis?.microSegments.length ?? 0).toBeGreaterThan(0);
  });

  it("includes the trailing partial bin in elevation and GAP analysis", () => {
    const analysis = analyzeRouteForGap([
      {
        latitude: 41,
        longitude: -87,
        altitudeMeters: 100,
        timestampMs: 0,
        distanceFromPreviousMeters: 0,
        horizontalAccuracyMeters: 5,
        verticalAccuracyMeters: 3,
      },
      {
        latitude: 41,
        longitude: -86.99985,
        altitudeMeters: 101,
        timestampMs: 10_000,
        distanceFromPreviousMeters: 12,
        horizontalAccuracyMeters: 5,
        verticalAccuracyMeters: 3,
      },
      {
        latitude: 41,
        longitude: -86.9996,
        altitudeMeters: 103,
        timestampMs: 20_000,
        distanceFromPreviousMeters: 20,
        horizontalAccuracyMeters: 5,
        verticalAccuracyMeters: 3,
      },
      {
        latitude: 41,
        longitude: -86.99945,
        altitudeMeters: 104,
        timestampMs: 30_000,
        distanceFromPreviousMeters: 12,
        horizontalAccuracyMeters: 5,
        verticalAccuracyMeters: 3,
      },
    ]);

    expect(analysis).not.toBeNull();
    expect(analysis?.microSegments).toHaveLength(2);
    expect(analysis?.microSegments[1]?.distanceMeters).toBeCloseTo(12, 6);
    expect(analysis?.rawPaceSecondsPerMeter).toBeCloseTo(30 / 44, 6);
  });

  it("corrects smoothed altitude drift so loop routes do not end up net downhill", () => {
    const analysis = analyzeRouteForGap([
      {
        latitude: 41,
        longitude: -87,
        altitudeMeters: 200,
        timestampMs: 0,
        horizontalAccuracyMeters: 5,
        verticalAccuracyMeters: 3,
      },
      {
        latitude: 41,
        longitude: -86.9995,
        altitudeMeters: 205,
        timestampMs: 20_000,
        distanceFromPreviousMeters: 80,
        horizontalAccuracyMeters: 5,
        verticalAccuracyMeters: 3,
      },
      {
        latitude: 41,
        longitude: -86.999,
        altitudeMeters: 210,
        timestampMs: 40_000,
        distanceFromPreviousMeters: 80,
        horizontalAccuracyMeters: 5,
        verticalAccuracyMeters: 3,
      },
      {
        latitude: 41,
        longitude: -86.9985,
        altitudeMeters: 205,
        timestampMs: 60_000,
        distanceFromPreviousMeters: 80,
        horizontalAccuracyMeters: 5,
        verticalAccuracyMeters: 3,
      },
      {
        latitude: 41,
        longitude: -86.998,
        altitudeMeters: 200,
        timestampMs: 80_000,
        distanceFromPreviousMeters: 80,
        horizontalAccuracyMeters: 5,
        verticalAccuracyMeters: 3,
      },
    ]);

    expect(analysis).not.toBeNull();
    expect(Math.abs((analysis?.elevationAscentMeters ?? 0) - (analysis?.elevationDescentMeters ?? 0))).toBeLessThan(1);
  });

  it("calibrates route totals toward metadata ascent/descent", () => {
    const analysis = analyzeRouteForGap(
      [
        {
          latitude: 41,
          longitude: -87,
          altitudeMeters: 200,
          timestampMs: 0,
          horizontalAccuracyMeters: 5,
          verticalAccuracyMeters: 3,
        },
        {
          latitude: 41,
          longitude: -86.9995,
          altitudeMeters: 201,
          timestampMs: 20_000,
          distanceFromPreviousMeters: 80,
          horizontalAccuracyMeters: 5,
          verticalAccuracyMeters: 3,
        },
        {
          latitude: 41,
          longitude: -86.999,
          altitudeMeters: 202,
          timestampMs: 40_000,
          distanceFromPreviousMeters: 80,
          horizontalAccuracyMeters: 5,
          verticalAccuracyMeters: 3,
        },
        {
          latitude: 41,
          longitude: -86.9985,
          altitudeMeters: 201.4,
          timestampMs: 60_000,
          distanceFromPreviousMeters: 80,
          horizontalAccuracyMeters: 5,
          verticalAccuracyMeters: 3,
        },
        {
          latitude: 41,
          longitude: -86.998,
          altitudeMeters: 200,
          timestampMs: 80_000,
          distanceFromPreviousMeters: 80,
          horizontalAccuracyMeters: 5,
          verticalAccuracyMeters: 3,
        },
      ],
      {
        targetAscentMeters: 10,
        targetDescentMeters: 10,
        forceClosedLoop: true,
      },
    );

    expect(analysis).not.toBeNull();
    expect(analysis?.elevationAscentMeters ?? 0).toBeGreaterThan(0.25);
    expect(analysis?.elevationDescentMeters ?? 0).toBeGreaterThan(0.25);
    expect(Math.abs((analysis?.elevationAscentMeters ?? 0) - (analysis?.elevationDescentMeters ?? 0))).toBeLessThan(1);
  });

  it("treats downhill efforts as requiring a slower flat-equivalent pace", () => {
    const rawPace = 0.36;
    const uphillGap = calculateGradeAdjustedPace(rawPace, 0.06);
    const downhillGap = calculateGradeAdjustedPace(rawPace, -0.06);
    const averageGap = (uphillGap + downhillGap) / 2;

    expect(downhillGap).toBeGreaterThan(rawPace);
    expect(averageGap).toBeGreaterThan(rawPace);
    expect(uphillGap).toBeLessThan(rawPace);
  });

  it("uses the Minetti flat-ground constant from the spec", () => {
    expect(calculateMinettiCost(0)).toBeCloseTo(3.6, 6);
  });
});
