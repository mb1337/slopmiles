import { describe, expect, it } from "vitest";

import { hasImportedWorkoutIntervals, normalizeImportedWorkoutIntervals } from "./healthkitIntervals";

describe("healthkit intervals", () => {
  it("sorts the flattened intervals field", () => {
    expect(
      normalizeImportedWorkoutIntervals({
        intervals: [
          {
            startedAt: 2_000,
            endedAt: 3_000,
            durationSeconds: 1,
          },
          {
            startedAt: 1_000,
            endedAt: 2_000,
            durationSeconds: 1,
          },
        ],
      }),
    ).toEqual([
      {
        startedAt: 1_000,
        endedAt: 2_000,
        durationSeconds: 1,
      },
      {
        startedAt: 2_000,
        endedAt: 3_000,
        durationSeconds: 1,
      },
    ]);
  });

  it("returns an empty array when intervals are absent", () => {
    expect(normalizeImportedWorkoutIntervals({})).toEqual([]);
  });

  it("detects whether a workout has any interval detail", () => {
    expect(hasImportedWorkoutIntervals({ intervals: [] })).toBe(false);
    expect(hasImportedWorkoutIntervals({ intervals: [{ startedAt: 1_000, endedAt: 2_000, durationSeconds: 1 }] })).toBe(true);
  });
});
