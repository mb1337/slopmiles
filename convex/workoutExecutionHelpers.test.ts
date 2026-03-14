import { describe, expect, it } from "vitest";

import { listMatchCandidatesForImportedWorkout, listPlanWorkoutsWithWeeks } from "./workoutExecutionHelpers";

function buildReaderCtx(data: {
  trainingWeeks: unknown[];
  workouts: unknown[];
  workoutExecutions: unknown[];
}) {
  const indexCalls: Array<{ table: string; indexName: string }> = [];

  return {
    db: {
      query(table: "trainingWeeks" | "workouts" | "workoutExecutions") {
        return {
          withIndex(indexName: string) {
            indexCalls.push({ table, indexName });
            return {
              collect: async () => data[table],
            };
          },
        };
      },
    },
    indexCalls,
  };
}

describe("workout execution helpers", () => {
  it("loads plan workouts through the plan-scoped workout index", async () => {
    const ctx = buildReaderCtx({
      trainingWeeks: [
        {
          _id: "week-1",
          planId: "plan-1",
        },
      ],
      workouts: [
        {
          _id: "workout-1",
          planId: "plan-1",
          weekId: "week-1",
          scheduledDateKey: "2026-03-10",
        },
      ],
      workoutExecutions: [],
    });

    const entries = await listPlanWorkoutsWithWeeks(ctx as never, "plan-1" as never);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.week._id).toBe("week-1");
    expect(entries[0]?.workout._id).toBe("workout-1");
    expect(ctx.indexCalls).toContainEqual({
      table: "workouts",
      indexName: "by_plan_id_scheduled_date_key",
    });
  });

  it("treats run/walk workouts as aerobic match candidates for unstructured imports", async () => {
    const ctx = buildReaderCtx({
      trainingWeeks: [
        {
          _id: "week-1",
          planId: "plan-1",
        },
      ],
      workouts: [
        {
          _id: "workout-1",
          planId: "plan-1",
          weekId: "week-1",
          type: "runWalk",
          scheduledDateKey: "2026-03-10",
          absoluteVolume: 1800,
        },
      ],
      workoutExecutions: [],
    });

    const candidates = await listMatchCandidatesForImportedWorkout(ctx as never, {
      userId: "user-1" as never,
      importedWorkout: {
        _id: "hk-1",
        startedAt: Date.UTC(2026, 2, 10, 12, 0, 0),
        durationSeconds: 1860,
      } as never,
      plan: {
        _id: "plan-1",
        startDateKey: "2026-03-09",
        numberOfWeeks: 1,
        canonicalTimeZoneId: "UTC",
        volumeMode: "time",
      } as never,
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.workout.type).toBe("runWalk");
  });

  it("does not match structured imports to run/walk workouts", async () => {
    const ctx = buildReaderCtx({
      trainingWeeks: [
        {
          _id: "week-1",
          planId: "plan-1",
        },
      ],
      workouts: [
        {
          _id: "workout-1",
          planId: "plan-1",
          weekId: "week-1",
          type: "runWalk",
          scheduledDateKey: "2026-03-10",
          absoluteVolume: 1800,
        },
        {
          _id: "workout-2",
          planId: "plan-1",
          weekId: "week-1",
          type: "tempo",
          scheduledDateKey: "2026-03-10",
          absoluteVolume: 1800,
        },
      ],
      workoutExecutions: [],
    });

    const candidates = await listMatchCandidatesForImportedWorkout(ctx as never, {
      userId: "user-1" as never,
      importedWorkout: {
        _id: "hk-1",
        startedAt: Date.UTC(2026, 2, 10, 12, 0, 0),
        durationSeconds: 1860,
        intervals: [
          {
            startedAt: Date.UTC(2026, 2, 10, 12, 10, 0),
            endedAt: Date.UTC(2026, 2, 10, 12, 14, 0),
            durationSeconds: 240,
          },
        ],
      } as never,
      plan: {
        _id: "plan-1",
        startDateKey: "2026-03-09",
        numberOfWeeks: 1,
        canonicalTimeZoneId: "UTC",
        volumeMode: "time",
      } as never,
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.workout.type).toBe("tempo");
  });

  it("treats speed workouts as structured match candidates", async () => {
    const ctx = buildReaderCtx({
      trainingWeeks: [
        {
          _id: "week-1",
          planId: "plan-1",
        },
      ],
      workouts: [
        {
          _id: "workout-1",
          planId: "plan-1",
          weekId: "week-1",
          type: "speed",
          scheduledDateKey: "2026-03-10",
          absoluteVolume: 1800,
        },
      ],
      workoutExecutions: [],
    });

    const candidates = await listMatchCandidatesForImportedWorkout(ctx as never, {
      userId: "user-1" as never,
      importedWorkout: {
        _id: "hk-1",
        startedAt: Date.UTC(2026, 2, 10, 12, 0, 0),
        durationSeconds: 1860,
        intervals: [
          {
            startedAt: Date.UTC(2026, 2, 10, 12, 10, 0),
            endedAt: Date.UTC(2026, 2, 10, 12, 10, 45),
            durationSeconds: 45,
          },
        ],
      } as never,
      plan: {
        _id: "plan-1",
        startDateKey: "2026-03-09",
        numberOfWeeks: 1,
        canonicalTimeZoneId: "UTC",
        volumeMode: "time",
      } as never,
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.workout.type).toBe("speed");
  });
});
