import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { addDays, dateKeyFromEpochMs, type DateKey } from "../packages/domain/src/calendar";
import { deriveCurrentWeekNumber, isWeekGeneratable } from "./planWeeks";
import { listPlannedWorkoutExecutionStatusesByPlanId } from "./workoutExecutionHelpers";
import { weekdays } from "./constants";
export { deleteRace } from "./settings";

const weekdayValidator = v.union(...weekdays.map((day) => v.literal(day)));

async function requireAuthenticatedUserId(ctx: QueryCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Authentication required.");
  }

  return userId;
}

async function requireAuthenticatedMutationUserId(ctx: MutationCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Authentication required.");
  }
  return userId;
}

async function insertCoachEvent(
  ctx: MutationCtx,
  userId: Id<"users">,
  body: string,
  planId?: Id<"trainingPlans">,
  cta?: { label: string; tab: "plan" | "history" | "settings" | "coach" },
) {
  await ctx.db.insert("coachMessages", {
    userId,
    author: "coach",
    kind: "event",
    body,
    planId,
    cta,
    createdAt: Date.now(),
  });
}

async function getLatestWeekDetailGenerationRequest(args: {
  ctx: QueryCtx;
  userId: Id<"users">;
  planId: Id<"trainingPlans">;
  weekNumber: number;
}) {
  const requests = await args.ctx.db
    .query("aiRequests")
    .withIndex("by_user_id_call_type_created_at", (queryBuilder) =>
      queryBuilder.eq("userId", args.userId).eq("callType", "weekDetailGeneration"),
    )
    .order("desc")
    .take(50);

  return (
    requests.find((request) => {
      const input = request.input as { planId?: Id<"trainingPlans">; weekNumber?: number } | undefined;
      return input?.planId === args.planId && input?.weekNumber === args.weekNumber;
    }) ?? null
  );
}

function normalizeAvailabilityOverride(
  value: unknown,
): {
  preferredRunningDays?: string[];
  availabilityWindows?: Record<string, Array<{ start: string; end: string }>>;
  note?: string;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as {
    preferredRunningDays?: unknown;
    availabilityWindows?: unknown;
    note?: unknown;
  };

  return {
    ...(Array.isArray(candidate.preferredRunningDays)
      ? {
          preferredRunningDays: candidate.preferredRunningDays.filter(
            (entry): entry is string => typeof entry === "string",
          ),
        }
      : {}),
    ...(candidate.availabilityWindows && typeof candidate.availabilityWindows === "object" && !Array.isArray(candidate.availabilityWindows)
      ? { availabilityWindows: candidate.availabilityWindows as Record<string, Array<{ start: string; end: string }>> }
      : {}),
    ...(typeof candidate.note === "string" && candidate.note.trim().length > 0 ? { note: candidate.note.trim() } : {}),
  };
}

export const getWeekDetailView = query({
  args: {
    planId: v.id("trainingPlans"),
    weekNumber: v.number(),
    nowBucketMs: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const plan = await ctx.db.get(args.planId);
    if (!plan || plan.userId !== userId) {
      throw new Error("Plan not found.");
    }

    const week = await ctx.db
      .query("trainingWeeks")
      .withIndex("by_plan_id_week_number", (queryBuilder) =>
        queryBuilder.eq("planId", plan._id).eq("weekNumber", Math.round(args.weekNumber)),
      )
      .unique();
    if (!week) {
      throw new Error("Week not found.");
    }

    const [goal, workouts, strengthWorkouts, races, executionStatusResult, latestRequest] = await Promise.all([
      ctx.db.get(plan.goalId),
      ctx.db
        .query("workouts")
        .withIndex("by_week_id_scheduled_date_key", (queryBuilder) => queryBuilder.eq("weekId", week._id))
        .collect(),
      ctx.db
        .query("strengthWorkouts")
        .withIndex("by_week_id", (queryBuilder) => queryBuilder.eq("weekId", week._id))
        .collect(),
      ctx.db
        .query("races")
        .withIndex("by_plan_id", (queryBuilder) => queryBuilder.eq("planId", plan._id))
        .collect(),
      listPlannedWorkoutExecutionStatusesByPlanId(ctx, plan._id),
      getLatestWeekDetailGenerationRequest({
        ctx,
        userId,
        planId: plan._id,
        weekNumber: week.weekNumber,
      }),
    ]);
    const executionByWorkoutId = executionStatusResult.byPlannedWorkoutId;

    const groupedDays = new Map<string, typeof workouts>();
    for (const workout of [...workouts].sort((left, right) => left.scheduledDateKey.localeCompare(right.scheduledDateKey))) {
      const bucket = groupedDays.get(workout.scheduledDateKey) ?? [];
      bucket.push(workout);
      groupedDays.set(workout.scheduledDateKey, bucket);
    }

    return {
      plan: {
        _id: plan._id,
        goalLabel: goal?.label ?? "Current plan",
        status: plan.status,
        numberOfWeeks: plan.numberOfWeeks,
        volumeMode: plan.volumeMode,
        peakWeekVolume: plan.peakWeekVolume,
        currentWeekNumber: plan.startDateKey ? deriveCurrentWeekNumber(plan, args.nowBucketMs) : null,
      },
      week: {
        ...week,
        availabilityOverride: normalizeAvailabilityOverride(week.availabilityOverride),
      },
      canGenerate: plan.status === "active" ? isWeekGeneratable(plan, week.weekNumber, args.nowBucketMs) : false,
      latestRequest: latestRequest
        ? {
            _id: latestRequest._id,
            status: latestRequest.status,
            errorMessage: latestRequest.errorMessage,
          }
        : null,
      workouts: workouts
        .sort((left, right) => left.scheduledDateKey.localeCompare(right.scheduledDateKey))
        .map((workout) => ({
          ...workout,
          execution: executionByWorkoutId.get(String(workout._id)) ?? null,
        })),
      days: [...groupedDays.entries()].map(([dateKey, dayWorkouts]) => ({
        dateKey,
        workouts: dayWorkouts.map((workout) => {
          const execution = executionByWorkoutId.get(String(workout._id)) ?? null;
          return {
            _id: workout._id,
            type: workout.type,
            volumePercent: workout.volumePercent,
            absoluteVolume: workout.absoluteVolume,
            scheduledDateKey: workout.scheduledDateKey,
            notes: workout.notes,
            venue: workout.venue,
            status: execution?.matchStatus === "matched" ? "completed" : workout.status,
            hasExecution: Boolean(execution),
            checkInStatus: execution?.checkInStatus ?? null,
          };
        }),
      })),
      strengthWorkouts,
      races: races.filter((race) => {
        const raceDateKey = dateKeyFromEpochMs(race.plannedDate, plan.canonicalTimeZoneId ?? "UTC");
        return raceDateKey >= week.weekStartDateKey && raceDateKey <= week.weekEndDateKey;
      }),
      rescheduleOptions: (() => {
        const options: string[] = [];
        let cursor: DateKey = week.weekStartDateKey as DateKey;
        while (cursor <= (week.weekEndDateKey as DateKey)) {
          options.push(cursor);
          if (cursor === (week.weekEndDateKey as DateKey)) {
            break;
          }
          cursor = addDays(cursor, 1);
        }
        return options;
      })(),
    };
  },
});

export const saveWeekAvailabilityOverride = mutation({
  args: {
    weekId: v.id("trainingWeeks"),
    preferredRunningDays: v.optional(v.array(weekdayValidator)),
    availabilityWindows: v.optional(v.any()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedMutationUserId(ctx);
    const week = await ctx.db.get(args.weekId);
    if (!week) {
      throw new Error("Week not found.");
    }
    const plan = await ctx.db.get(week.planId);
    if (!plan || plan.userId !== userId) {
      throw new Error("Week not found for user.");
    }
    await ctx.db.patch(week._id, {
      availabilityOverride: {
        ...(args.preferredRunningDays ? { preferredRunningDays: args.preferredRunningDays } : {}),
        ...(args.availabilityWindows ? { availabilityWindows: args.availabilityWindows } : {}),
        ...(args.note?.trim() ? { note: args.note.trim() } : {}),
      },
      updatedAt: Date.now(),
    });
    await insertCoachEvent(ctx, userId, `Availability override saved for week ${week.weekNumber}.`, plan._id, {
      label: "Review week",
      tab: "plan",
    });
  },
});

export const clearWeekAvailabilityOverride = mutation({
  args: {
    weekId: v.id("trainingWeeks"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedMutationUserId(ctx);
    const week = await ctx.db.get(args.weekId);
    if (!week) {
      throw new Error("Week not found.");
    }
    const plan = await ctx.db.get(week.planId);
    if (!plan || plan.userId !== userId) {
      throw new Error("Week not found for user.");
    }
    await ctx.db.patch(week._id, {
      availabilityOverride: undefined,
      updatedAt: Date.now(),
    });
  },
});
