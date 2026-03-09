import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { getAuthUserId } from "@convex-dev/auth/server";

import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { deriveCurrentWeekNumber, isWeekGeneratable } from "./planWeeks";
import {
  getActivePlan,
  getExecutionDetailRecord,
  historyWorkoutStatusFromExecution,
  listPlannedWorkoutExecutionStatusesByPlanId,
  listPlanWorkoutsWithWeeks,
} from "./workoutExecutionHelpers";
import { addDays, dateKeyFromEpochMs, type DateKey } from "../packages/domain/src/calendar";

type PlanProposal = {
  numberOfWeeks: number;
  peakWeekVolume: number;
  weeklyVolumeProfile: Array<{
    weekNumber: number;
    percentOfPeak: number;
  }>;
  weeklyEmphasis: Array<{
    weekNumber: number;
    emphasis: string;
  }>;
  rationale: string;
  metadata?: {
    model?: string;
  };
  corrections?: string[];
};

async function requireAuthenticatedUserId(ctx: QueryCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Authentication required.");
  }

  return userId;
}

async function loadPlanGoal(
  ctx: QueryCtx,
  plan: Doc<"trainingPlans">,
): Promise<{
  _id: Id<"goals">;
  type: Doc<"goals">["type"];
  label: string;
  targetDate?: number;
  goalTimeSeconds?: number;
} | null> {
  const goal = await ctx.db.get(plan.goalId);
  if (!goal) {
    return null;
  }

  return {
    _id: goal._id,
    type: goal.type,
    label: goal.label,
    targetDate: goal.targetDate,
    goalTimeSeconds: goal.goalTimeSeconds,
  };
}

async function listPlanSummaries(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<
  Array<{
    _id: Id<"trainingPlans">;
    status: Doc<"trainingPlans">["status"];
    startDateKey?: string;
    canonicalTimeZoneId?: string;
    activatedAt?: number;
    numberOfWeeks: number;
    volumeMode: Doc<"trainingPlans">["volumeMode"];
    peakWeekVolume: number;
    generationRationale?: string;
    createdAt: number;
    goal: NonNullable<Awaited<ReturnType<typeof loadPlanGoal>>>;
    weeklyVolumeProfile: Doc<"trainingPlans">["weeklyVolumeProfile"];
    weeklyEmphasis: Doc<"trainingPlans">["weeklyEmphasis"];
  }>
> {
  const plans = await ctx.db
    .query("trainingPlans")
    .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
    .collect();

  const summaries = await Promise.all(
    plans.map(async (plan) => {
      const goal = await loadPlanGoal(ctx, plan);
      if (!goal) {
        return null;
      }

      return {
        _id: plan._id,
        status: plan.status,
        startDateKey: plan.startDateKey,
        canonicalTimeZoneId: plan.canonicalTimeZoneId,
        activatedAt: plan.activatedAt,
        numberOfWeeks: plan.numberOfWeeks,
        volumeMode: plan.volumeMode,
        peakWeekVolume: plan.peakWeekVolume,
        generationRationale: plan.generationRationale,
        createdAt: plan.createdAt,
        goal,
        weeklyVolumeProfile: plan.weeklyVolumeProfile,
        weeklyEmphasis: plan.weeklyEmphasis,
      };
    }),
  );

  return summaries.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

function parsePlanProposal(value: unknown): PlanProposal | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as {
    numberOfWeeks?: unknown;
    peakWeekVolume?: unknown;
    weeklyVolumeProfile?: unknown;
    weeklyEmphasis?: unknown;
    rationale?: unknown;
    metadata?: {
      model?: unknown;
    };
    corrections?: unknown;
  };

  if (
    typeof candidate.numberOfWeeks !== "number" ||
    typeof candidate.peakWeekVolume !== "number" ||
    !Array.isArray(candidate.weeklyVolumeProfile) ||
    !Array.isArray(candidate.weeklyEmphasis) ||
    typeof candidate.rationale !== "string"
  ) {
    return null;
  }

  return {
    numberOfWeeks: candidate.numberOfWeeks,
    peakWeekVolume: candidate.peakWeekVolume,
    weeklyVolumeProfile: candidate.weeklyVolumeProfile as PlanProposal["weeklyVolumeProfile"],
    weeklyEmphasis: candidate.weeklyEmphasis as PlanProposal["weeklyEmphasis"],
    rationale: candidate.rationale,
    ...(typeof candidate.metadata?.model === "string" ? { metadata: { model: candidate.metadata.model } } : {}),
    ...(Array.isArray(candidate.corrections)
      ? {
          corrections: candidate.corrections.filter((entry): entry is string => typeof entry === "string"),
        }
      : {}),
  };
}

async function getLatestPlanGenerationRequest(
  ctx: QueryCtx,
  userId: Id<"users">,
) {
  const requests = await ctx.db
    .query("aiRequests")
    .withIndex("by_user_id_call_type_created_at", (queryBuilder) =>
      queryBuilder.eq("userId", userId).eq("callType", "planGeneration"),
    )
    .order("desc")
    .take(1);

  return requests[0] ?? null;
}

async function getLatestCoachMessage(ctx: QueryCtx, userId: Id<"users">) {
  const messages = await ctx.db
    .query("coachMessages")
    .withIndex("by_user_id_author_created_at", (queryBuilder) =>
      queryBuilder.eq("userId", userId).eq("author", "coach"),
    )
    .order("desc")
    .take(1);

  return messages[0] ?? null;
}

async function getLatestWorkoutByHistoryStatus(args: {
  ctx: QueryCtx;
  userId: Id<"users">;
  historyStatus: "needsReview" | "unplanned";
}) {
  const workouts = await args.ctx.db
    .query("healthKitWorkouts")
    .withIndex("by_user_id_history_status_started_at", (queryBuilder) =>
      queryBuilder.eq("userId", args.userId).eq("historyStatus", args.historyStatus),
    )
    .order("desc")
    .take(1);

  return workouts[0] ?? null;
}

async function getLatestReviewWorkout(args: {
  ctx: QueryCtx;
  userId: Id<"users">;
}) {
  const [needsReviewWorkout, unplannedWorkout] = await Promise.all([
    getLatestWorkoutByHistoryStatus({ ...args, historyStatus: "needsReview" }),
    getLatestWorkoutByHistoryStatus({ ...args, historyStatus: "unplanned" }),
  ]);

  const workout =
    !needsReviewWorkout ? unplannedWorkout
    : !unplannedWorkout ? needsReviewWorkout
    : needsReviewWorkout.startedAt >= unplannedWorkout.startedAt ? needsReviewWorkout : unplannedWorkout;

  if (!workout) {
    return null;
  }

  const execution = await args.ctx.db
    .query("workoutExecutions")
    .withIndex("by_healthkit_workout_id", (queryBuilder) =>
      queryBuilder.eq("healthKitWorkoutId", workout._id),
    )
    .unique();

  return {
    workout,
    execution,
  };
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

async function hasDraftPlan(ctx: QueryCtx, userId: Id<"users">) {
  const drafts = await ctx.db
    .query("trainingPlans")
    .withIndex("by_user_id_status", (queryBuilder) =>
      queryBuilder.eq("userId", userId).eq("status", "draft"),
    )
    .take(1);

  return drafts.length > 0;
}

function resolveHistoryStatus(
  execution: {
    matchStatus: "matched" | "needsReview" | "unmatched";
  } | null,
): "matched" | "needsReview" | "unplanned" {
  if (!execution) {
    return "unplanned";
  }

  if (execution.matchStatus === "matched") {
    return "matched";
  }

  if (execution.matchStatus === "needsReview") {
    return "needsReview";
  }

  return "unplanned";
}

function buildCoachPrompts(args: {
  hasActivePlan: boolean;
  hasDraftPlan: boolean;
  hasCurrentWeek: boolean;
  hasUnmatchedRun: boolean;
}) {
  if (!args.hasActivePlan) {
    const prompts = [
      "Help me choose between a 5K and 10K goal.",
      "What peak volume should I target for a safe build?",
      "Pressure-test my schedule before I create a draft.",
    ];
    if (args.hasDraftPlan) {
      prompts.unshift("Compare my drafts and tell me which one is more realistic.");
    }
    return prompts;
  }

  const prompts = [
    "I need to skip today's run. What should I protect this week?",
    "Help me move my long run without wrecking recovery.",
    "Is my current goal still realistic based on the last two weeks?",
  ];

  if (args.hasCurrentWeek) {
    prompts.unshift("Summarize the priority for this week in plain English.");
  }

  if (args.hasUnmatchedRun) {
    prompts.push("I logged an extra run. How should it change the rest of my week?");
  }

  return prompts;
}

function normalizeAvailabilityOverride(
  value: unknown,
):
  | {
      preferredRunningDays?: string[];
      availabilityWindows?: Record<string, Array<{ start: string; end: string }>>;
      note?: string;
    }
  | null {
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

export const getHomeSummary = query({
  args: {
    nowBucketMs: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const [user, planSummaries, latestCoachMessage, reviewWorkout] = await Promise.all([
      ctx.db.get(userId),
      listPlanSummaries(ctx, userId),
      getLatestCoachMessage(ctx, userId),
      getLatestReviewWorkout({
        ctx,
        userId,
      }),
    ]);

    const sortedPlans = [...planSummaries].sort((left, right) => right.createdAt - left.createdAt);
    let activePlanSummary: (typeof sortedPlans)[number] | null = null;
    const draftPlans: typeof sortedPlans = [];
    const pastPlans: typeof sortedPlans = [];

    for (const plan of sortedPlans) {
      if (!activePlanSummary && plan.status === "active") {
        activePlanSummary = plan;
        continue;
      }

      if (plan.status === "draft") {
        draftPlans.push(plan);
        continue;
      }

      if (plan.status === "completed" || plan.status === "abandoned") {
        pastPlans.push(plan);
      }
    }
    if (!activePlanSummary) {
      return {
        currentVDOT: user?.currentVDOT ?? null,
        latestCoachMessage: latestCoachMessage
          ? {
              id: String(latestCoachMessage._id),
              body: latestCoachMessage.body,
              kind: latestCoachMessage.kind,
              createdAt: latestCoachMessage.createdAt,
            }
          : null,
        activePlan: null,
        nextWorkout: null,
        weekProgress: null,
        pendingActions: [
          ...(draftPlans[0]
            ? [
                {
                  kind: "activateDraft" as const,
                  label: "Review draft",
                  description: `${draftPlans[0].goal.label} draft is ready to review and activate.`,
                  draftPlanId: draftPlans[0]._id,
                },
              ]
            : []),
          {
            kind: "createPlan" as const,
            label: "Create plan",
            description: "Start a new training plan around a goal, timeline, and preferred volume mode.",
          },
          ...(reviewWorkout
            ? [
                {
                  kind: "reviewHistory" as const,
                  label: "Review unmatched run",
                  description: "A recent imported run needs review before the coach can reason about it clearly.",
                  healthKitWorkoutId: reviewWorkout.workout._id,
                },
              ]
            : []),
        ],
        pastPlan: pastPlans[0]
          ? {
              _id: pastPlans[0]._id,
              status: pastPlans[0].status,
              label: pastPlans[0].goal.label,
              createdAt: pastPlans[0].createdAt,
            }
          : null,
      };
    }

    const activePlan = await ctx.db.get(activePlanSummary._id);
    if (!activePlan) {
      throw new Error("Active plan could not be loaded.");
    }

    const [trainingWeeks, planEntries, executionStatusResult] = await Promise.all([
      ctx.db
        .query("trainingWeeks")
        .withIndex("by_plan_id", (queryBuilder) => queryBuilder.eq("planId", activePlan._id))
        .collect(),
      listPlanWorkoutsWithWeeks(ctx, activePlan._id),
      listPlannedWorkoutExecutionStatusesByPlanId(ctx, activePlan._id),
    ]);
    const executionStatusByPlannedWorkoutId = executionStatusResult.byPlannedWorkoutId;

    const currentWeekNumber = deriveCurrentWeekNumber(activePlan, args.nowBucketMs);
    const currentWeek =
      typeof currentWeekNumber === "number"
        ? trainingWeeks.find((week) => week.weekNumber === currentWeekNumber) ?? null
        : null;

    const todayDateKey =
      activePlan.canonicalTimeZoneId
        ? dateKeyFromEpochMs(args.nowBucketMs, activePlan.canonicalTimeZoneId)
        : null;

    const upcomingWorkouts = planEntries
      .map((entry) => ({
        workout: entry.workout,
        executionStatus: executionStatusByPlannedWorkoutId.get(String(entry.workout._id)) ?? null,
      }))
      .filter((entry) => entry.workout.status !== "skipped" && entry.executionStatus?.matchStatus !== "matched")
      .sort((left, right) => left.workout.scheduledDateKey.localeCompare(right.workout.scheduledDateKey));

    const nextWorkout =
      upcomingWorkouts.find((entry) => (todayDateKey ? entry.workout.scheduledDateKey >= todayDateKey : true)) ??
      upcomingWorkouts[0] ??
      null;

    const currentWeekEntries =
      currentWeek
        ? planEntries.filter((entry) => entry.week._id === currentWeek._id)
        : [];
    const currentWeekCompletedCount = currentWeekEntries.filter(
      (entry) => executionStatusByPlannedWorkoutId.get(String(entry.workout._id))?.matchStatus === "matched",
    ).length;

    const pendingActions = [];
    if (currentWeek && !currentWeek.generated && isWeekGeneratable(activePlan, currentWeek.weekNumber, args.nowBucketMs)) {
      pendingActions.push({
        kind: "generateWeek" as const,
        label: `Generate week ${currentWeek.weekNumber}`,
        description: "Build this week's workouts before you need them.",
        weekNumber: currentWeek.weekNumber,
      });
    }

    if (currentWeek?.generated) {
      const workoutNeedingCheckIn = currentWeekEntries.find((entry) => {
        const executionStatus = executionStatusByPlannedWorkoutId.get(String(entry.workout._id));
        return executionStatus?.matchStatus === "matched" && executionStatus.checkInStatus !== "submitted";
      });

      if (workoutNeedingCheckIn) {
        pendingActions.push({
          kind: "submitCheckIn" as const,
          label: "Finish post-run check-in",
          description: "One completed workout still needs subjective feedback.",
          workoutId: workoutNeedingCheckIn.workout._id,
          weekNumber: currentWeek.weekNumber,
        });
      }
    }

    if (reviewWorkout) {
      pendingActions.push({
        kind: "reviewHistory" as const,
        label: "Review unmatched run",
        description: "Reconcile a recent imported run so history and coach analysis stay accurate.",
        healthKitWorkoutId: reviewWorkout.workout._id,
      });
    }

    if (draftPlans[0]) {
      pendingActions.push({
        kind: "activateDraft" as const,
        label: "Review draft",
        description: `${draftPlans[0].goal.label} draft is ready if you want to switch plans later.`,
        draftPlanId: draftPlans[0]._id,
      });
    }

    if (pendingActions.length === 0) {
      pendingActions.push({
        kind: "messageCoach" as const,
        label: "Message coach",
        description: "Ask for adjustments, tradeoffs, or a quick read on how training is going.",
      });
    }

    return {
      currentVDOT: user?.currentVDOT ?? null,
      latestCoachMessage: latestCoachMessage
        ? {
            id: String(latestCoachMessage._id),
            body: latestCoachMessage.body,
            kind: latestCoachMessage.kind,
            createdAt: latestCoachMessage.createdAt,
          }
        : null,
      activePlan: {
        _id: activePlanSummary._id,
        label: activePlanSummary.goal.label,
        numberOfWeeks: activePlanSummary.numberOfWeeks,
        volumeMode: activePlanSummary.volumeMode,
        peakWeekVolume: activePlanSummary.peakWeekVolume,
        currentWeekNumber,
      },
      nextWorkout: nextWorkout
        ? {
            _id: nextWorkout.workout._id,
            weekNumber:
              planEntries.find((entry) => entry.workout._id === nextWorkout.workout._id)?.week.weekNumber ?? null,
            scheduledDateKey: nextWorkout.workout.scheduledDateKey,
            type: nextWorkout.workout.type,
            absoluteVolume: nextWorkout.workout.absoluteVolume,
            volumePercent: nextWorkout.workout.volumePercent,
            venue: nextWorkout.workout.venue,
            status: nextWorkout.workout.status,
          }
        : null,
      weekProgress: currentWeek
        ? {
            weekNumber: currentWeek.weekNumber,
            totalWorkouts: currentWeekEntries.length,
            completedWorkouts: currentWeekCompletedCount,
            targetVolumeAbsolute: currentWeek.targetVolumeAbsolute,
            targetVolumePercent: currentWeek.targetVolumePercent,
            emphasis: currentWeek.emphasis,
          }
        : null,
      pendingActions,
      pastPlan: pastPlans[0]
        ? {
            _id: pastPlans[0]._id,
            status: pastPlans[0].status,
            label: pastPlans[0].goal.label,
            createdAt: pastPlans[0].createdAt,
          }
        : null,
    };
  },
});

export const getPlanOverview = query({
  args: {
    nowBucketMs: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const [planSummaries, latestRequest] = await Promise.all([
      listPlanSummaries(ctx, userId),
      getLatestPlanGenerationRequest(ctx, userId),
    ]);

    const sortedPlans = [...planSummaries].sort((left, right) => right.createdAt - left.createdAt);
    const activePlanSummary = sortedPlans.find((plan) => plan.status === "active") ?? null;
    const draftPlans = sortedPlans.filter((plan) => plan.status === "draft");
    const pastPlans = sortedPlans.filter((plan) => plan.status === "completed" || plan.status === "abandoned");
    const proposal = latestRequest ? parsePlanProposal(latestRequest.result) : null;

    let activePlan = null;
    if (activePlanSummary) {
      const activePlanDoc = await ctx.db.get(activePlanSummary._id);
      if (!activePlanDoc) {
        throw new Error("Active plan could not be loaded.");
      }

      const trainingWeeks = await ctx.db
        .query("trainingWeeks")
        .withIndex("by_plan_id", (queryBuilder) => queryBuilder.eq("planId", activePlanSummary._id))
        .collect();

      const currentWeekNumber = deriveCurrentWeekNumber(activePlanDoc, args.nowBucketMs);
      activePlan = {
        ...activePlanSummary,
        currentWeekNumber,
        nextWeekNumber:
          currentWeekNumber && currentWeekNumber < activePlanSummary.numberOfWeeks ? currentWeekNumber + 1 : null,
        trainingWeeks: trainingWeeks
          .sort((left, right) => left.weekNumber - right.weekNumber)
          .map((week) => ({
            _id: week._id,
            weekNumber: week.weekNumber,
            weekStartDateKey: week.weekStartDateKey,
            weekEndDateKey: week.weekEndDateKey,
            targetVolumePercent: week.targetVolumePercent,
            targetVolumeAbsolute: week.targetVolumeAbsolute,
            emphasis: week.emphasis,
            coachNotes: week.coachNotes,
            generated: week.generated,
          })),
      };
    }

    return {
      activePlan,
      draftPlans,
      pastPlans,
      proposal: latestRequest
        ? {
            _id: latestRequest._id,
            status: latestRequest.status,
            errorMessage: latestRequest.errorMessage,
            consumedByPlanId: latestRequest.consumedByPlanId ?? null,
            createdAt: latestRequest.createdAt,
            input: latestRequest.input,
            result: proposal,
          }
        : null,
    };
  },
});

export const getWeekAgenda = query({
  args: {
    planId: v.id("trainingPlans"),
    weekNumber: v.number(),
    nowBucketMs: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const plan = await ctx.db.get(args.planId);
    if (!plan || plan.userId !== userId) {
      throw new Error("Plan not found for user.");
    }

    const week = await ctx.db
      .query("trainingWeeks")
      .withIndex("by_plan_id_week_number", (queryBuilder) =>
        queryBuilder.eq("planId", plan._id).eq("weekNumber", Math.round(args.weekNumber)),
      )
      .unique();
    if (!week) {
      throw new Error("Training week not found.");
    }

    const [workouts, strengthWorkouts, races, executionStatusResult, latestRequest] = await Promise.all([
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
    const executionStatusByPlannedWorkoutId = executionStatusResult.byPlannedWorkoutId;

    const days = new Map<string, Array<(typeof workouts)[number]>>();
    for (const workout of workouts.sort((left, right) => left.scheduledDateKey.localeCompare(right.scheduledDateKey))) {
      const bucket = days.get(workout.scheduledDateKey) ?? [];
      bucket.push(workout);
      days.set(workout.scheduledDateKey, bucket);
    }

    return {
      plan: {
        _id: plan._id,
        numberOfWeeks: plan.numberOfWeeks,
        volumeMode: plan.volumeMode,
        peakWeekVolume: plan.peakWeekVolume,
        currentWeekNumber: deriveCurrentWeekNumber(plan, args.nowBucketMs),
      },
      week: {
        _id: week._id,
        weekNumber: week.weekNumber,
        weekStartDateKey: week.weekStartDateKey,
        weekEndDateKey: week.weekEndDateKey,
        targetVolumePercent: week.targetVolumePercent,
        targetVolumeAbsolute: week.targetVolumeAbsolute,
        emphasis: week.emphasis,
        coachNotes: week.coachNotes,
        generated: week.generated,
        interruptionType: week.interruptionType ?? null,
        interruptionNote: week.interruptionNote ?? null,
        availabilityOverride: normalizeAvailabilityOverride(week.availabilityOverride),
      },
      canGenerate: isWeekGeneratable(plan, week.weekNumber, args.nowBucketMs),
      latestRequest: latestRequest
        ? {
            _id: latestRequest._id,
            status: latestRequest.status,
            errorMessage: latestRequest.errorMessage,
          }
        : null,
      days: [...days.entries()].map(([dateKey, dayWorkouts]) => ({
        dateKey,
        workouts: dayWorkouts.map((workout) => {
          const execution = executionStatusByPlannedWorkoutId.get(String(workout._id)) ?? null;
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
      strengthWorkouts: strengthWorkouts.map((workout) => ({
        _id: workout._id,
        title: workout.title,
        plannedMinutes: workout.plannedMinutes,
        notes: workout.notes,
        exercises: workout.exercises,
        status: workout.status,
      })),
      races: races
        .filter((race) => {
          const raceDateKey = dateKeyFromEpochMs(race.plannedDate, plan.canonicalTimeZoneId ?? "UTC");
          return raceDateKey >= week.weekStartDateKey && raceDateKey <= week.weekEndDateKey;
        })
        .sort((left, right) => left.plannedDate - right.plannedDate)
        .map((race) => ({
          _id: race._id,
          label: race.label,
          plannedDate: race.plannedDate,
          distanceMeters: race.distanceMeters,
          goalTimeSeconds: race.goalTimeSeconds,
          actualTimeSeconds: race.actualTimeSeconds,
          isPrimaryGoal: race.isPrimaryGoal,
        })),
    };
  },
});

export const getWorkoutDetailView = query({
  args: {
    workoutId: v.id("workouts"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const workout = await ctx.db.get(args.workoutId);
    if (!workout) {
      throw new Error("Workout not found.");
    }

    const week = await ctx.db.get(workout.weekId);
    if (!week) {
      throw new Error("Training week not found for workout.");
    }

    const plan = await ctx.db.get(week.planId);
    if (!plan || plan.userId !== userId) {
      throw new Error("Workout not found for user.");
    }

    const goal = await ctx.db.get(plan.goalId);
    const execution = await ctx.db
      .query("workoutExecutions")
      .withIndex("by_planned_workout_id", (queryBuilder) => queryBuilder.eq("plannedWorkoutId", workout._id))
      .unique();
    const executionDetail = execution ? await getExecutionDetailRecord(ctx, userId, execution._id) : null;

    const rescheduleOptions: Array<string> = [];
    let dateCursor = week.weekStartDateKey as DateKey;
    while (dateCursor <= (week.weekEndDateKey as DateKey)) {
      if (dateCursor !== workout.scheduledDateKey) {
        rescheduleOptions.push(dateCursor);
      }
      if (dateCursor === week.weekEndDateKey) {
        break;
      }
      dateCursor = addDays(dateCursor, 1);
    }

    return {
      plan: {
        _id: plan._id,
        goalLabel: goal?.label ?? "Current plan",
        volumeMode: plan.volumeMode,
        peakWeekVolume: plan.peakWeekVolume,
        weekNumber: week.weekNumber,
      },
      week: {
        _id: week._id,
        weekNumber: week.weekNumber,
        weekStartDateKey: week.weekStartDateKey,
        weekEndDateKey: week.weekEndDateKey,
      },
      workout: {
        _id: workout._id,
        type: workout.type,
        volumePercent: workout.volumePercent,
        absoluteVolume: workout.absoluteVolume,
        scheduledDateKey: workout.scheduledDateKey,
        notes: workout.notes,
        venue: workout.venue,
        origin: workout.origin,
        status: executionDetail?.execution.matchStatus === "matched" ? "completed" : workout.status,
        segments: workout.segments,
      },
      executionDetail,
      primaryAction:
        executionDetail?.execution.matchStatus === "matched"
          ? executionDetail.execution.checkInStatus === "submitted"
            ? "viewActualRun"
            : "checkIn"
          : workout.status === "skipped"
            ? "reschedule"
            : "reviewExecution",
      rescheduleOptions,
    };
  },
});

export const getHistoryFeedCounts = query({
  args: {
  },
  handler: async (ctx) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const [matched, needsReview, unplanned] = await Promise.all([
      ctx.db
        .query("healthKitWorkouts")
        .withIndex("by_user_id_history_status_started_at", (queryBuilder) =>
          queryBuilder.eq("userId", userId).eq("historyStatus", "matched"),
        )
        .collect(),
      ctx.db
        .query("healthKitWorkouts")
        .withIndex("by_user_id_history_status_started_at", (queryBuilder) =>
          queryBuilder.eq("userId", userId).eq("historyStatus", "needsReview"),
        )
        .collect(),
      ctx.db
        .query("healthKitWorkouts")
        .withIndex("by_user_id_history_status_started_at", (queryBuilder) =>
          queryBuilder.eq("userId", userId).eq("historyStatus", "unplanned"),
        )
        .collect(),
    ]);

    return {
      matched: matched.length,
      needsReview: needsReview.length,
      unplanned: unplanned.length,
    };
  },
});

export const listHistoryFeedPage = query({
  args: {
    filter: v.optional(v.union(v.literal("all"), v.literal("matched"), v.literal("needsReview"), v.literal("unplanned"))),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const filter = args.filter ?? "all";
    const baseQuery =
      filter === "all"
        ? ctx.db
            .query("healthKitWorkouts")
            .withIndex("by_user_id_started_at", (queryBuilder) => queryBuilder.eq("userId", userId))
        : ctx.db
            .query("healthKitWorkouts")
            .withIndex("by_user_id_history_status_started_at", (queryBuilder) =>
              queryBuilder.eq("userId", userId).eq("historyStatus", filter),
            );
    const page = await baseQuery.order("desc").paginate(args.paginationOpts);

    return {
      ...page,
      page: page.page.map((workout) => ({
        _id: workout._id,
        startedAt: workout.startedAt,
        distanceMeters: workout.distanceMeters,
        durationSeconds: workout.durationSeconds,
        rawPaceSecondsPerMeter: workout.rawPaceSecondsPerMeter,
        status: workout.historyStatus ?? historyWorkoutStatusFromExecution(null),
      })),
    };
  },
});

export const getCoachInboxSummary = query({
  args: {
    nowBucketMs: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const [user, runningSchedule, competitiveness, personality, messages, activePlan, reviewWorkout, draftPlanExists] = await Promise.all([
      ctx.db.get(userId),
      ctx.db
        .query("runningSchedules")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
        .unique(),
      ctx.db
        .query("competitiveness")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
        .unique(),
      ctx.db
        .query("personalities")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
        .unique(),
      ctx.db
        .query("coachMessages")
        .withIndex("by_user_id_created_at", (queryBuilder) => queryBuilder.eq("userId", userId))
        .order("desc")
        .take(40),
      getActivePlan(ctx, userId),
      getLatestReviewWorkout({ ctx, userId }),
      hasDraftPlan(ctx, userId),
    ]);

    const activePlanGoal = activePlan ? await ctx.db.get(activePlan.goalId) : null;
    const currentWeekNumber = activePlan ? deriveCurrentWeekNumber(activePlan, args.nowBucketMs) : null;
    const hasUnmatchedRun = reviewWorkout !== null;

    return {
      currentVDOT: user?.currentVDOT ?? null,
      competitiveness: competitiveness?.level ?? "balanced",
      personality: {
        name: personality?.name ?? "noNonsense",
        description: personality?.description ?? "Brief, direct, no fluff.",
      },
      runningSchedule: runningSchedule
        ? {
            preferredRunningDays: runningSchedule.preferredRunningDays,
            runningDaysPerWeek: runningSchedule.runningDaysPerWeek,
            preferredLongRunDay: runningSchedule.preferredLongRunDay ?? null,
          }
        : null,
      activePlan: activePlan
        ? {
            _id: activePlan._id,
            goalLabel: activePlanGoal?.label ?? "Current plan",
            numberOfWeeks: activePlan.numberOfWeeks,
            volumeMode: activePlan.volumeMode,
            peakWeekVolume: activePlan.peakWeekVolume,
            currentWeekNumber,
          }
        : null,
      suggestedPrompts: buildCoachPrompts({
        hasActivePlan: Boolean(activePlan),
        hasDraftPlan: draftPlanExists,
        hasCurrentWeek: typeof currentWeekNumber === "number",
        hasUnmatchedRun,
      }),
      messages: [...messages]
        .reverse()
        .map((message) => ({
          _id: String(message._id),
          author: message.author,
          kind: message.kind,
          body: message.body,
          createdAt: message.createdAt,
          cta:
            message.kind === "event" && activePlan
              ? {
                  label: "Open plan",
                  tab: "plan" as const,
                }
              : hasUnmatchedRun
                ? {
                    label: "Review history",
                    tab: "history" as const,
                  }
                : null,
        })),
    };
  },
});
