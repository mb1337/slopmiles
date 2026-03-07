import { addDays, dateKeyFromEpochMs, diffDays, type DateKey } from "../packages/domain/src/calendar";
import type { DatabaseReader, DatabaseWriter, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  buildStructuredSegmentComparisons,
  resolveActualPaceMetrics,
  type SegmentComparison,
} from "./workoutMetrics";

type ReaderCtx = {
  db: DatabaseReader;
};

type WriterCtx = {
  db: DatabaseWriter;
};

type PlannedWorkoutCandidate = {
  workout: Doc<"workouts">;
  week: Doc<"trainingWeeks">;
  confidence: number;
  dateDelta: number;
  matchDateKey: DateKey;
};

function planEndDateKey(plan: Pick<Doc<"trainingPlans">, "startDateKey" | "numberOfWeeks">): DateKey | null {
  if (!plan.startDateKey) {
    return null;
  }

  return addDays(plan.startDateKey as DateKey, plan.numberOfWeeks * 7 - 1);
}

function isDateWithinPlanWindow(
  plan: Pick<Doc<"trainingPlans">, "startDateKey" | "numberOfWeeks">,
  targetDateKey: DateKey,
  bufferDays = 0,
): boolean {
  const endDateKey = planEndDateKey(plan);
  if (!plan.startDateKey || !endDateKey) {
    return false;
  }

  return (
    targetDateKey >= addDays(plan.startDateKey as DateKey, -bufferDays) &&
    targetDateKey <= addDays(endDateKey, bufferDays)
  );
}

function arraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function formatWorkoutType(type: Doc<"workouts">["type"]): string {
  switch (type) {
    case "easyRun":
      return "easy run";
    case "longRun":
      return "long run";
    case "tempo":
      return "tempo workout";
    case "intervals":
      return "interval workout";
    case "recovery":
      return "recovery run";
    default:
      return type;
  }
}

function formatModifier(modifier: Doc<"workoutExecutions">["modifiers"][number]): string {
  switch (modifier) {
    case "pushedStroller":
      return "pushed a stroller";
    case "ranWithDog":
      return "ran with a dog";
    case "trailOffRoad":
      return "ran off-road";
    case "treadmill":
      return "ran on a treadmill";
    case "highAltitude":
      return "trained at altitude";
    case "poorSleep":
      return "had poor sleep";
    case "feelingUnwell":
      return "felt unwell";
    default:
      return modifier;
  }
}

function flattenImportedIntervals(workout: Doc<"healthKitWorkouts">) {
  return (workout.intervalChains ?? [])
    .flatMap((chain) => chain.intervals)
    .sort((left, right) => {
      if (left.startedAt !== right.startedAt) {
        return left.startedAt - right.startedAt;
      }
      return left.endedAt - right.endedAt;
    });
}

function buildSegmentComparisons(
  plannedWorkout: Doc<"workouts"> | null,
  importedWorkout: Doc<"healthKitWorkouts">,
  currentVdot: number | null | undefined,
): SegmentComparison[] {
  if (!plannedWorkout) {
    return [];
  }

  return buildStructuredSegmentComparisons({
    segments: plannedWorkout.segments,
    intervals: flattenImportedIntervals(importedWorkout),
    currentVdot,
  });
}

function resolveWorkoutPaceMetrics(importedWorkout: Doc<"healthKitWorkouts">) {
  return resolveActualPaceMetrics({
    rawPaceSecondsPerMeter: importedWorkout.rawPaceSecondsPerMeter,
    gradeAdjustedPaceSecondsPerMeter: importedWorkout.gradeAdjustedPaceSecondsPerMeter,
  });
}

function summarizeStructuredComparisons(segmentComparisons: SegmentComparison[]): {
  averageAdherence: number;
  inferredRepCount: number;
} | null {
  if (segmentComparisons.length === 0) {
    return null;
  }

  const repComparisons = segmentComparisons.flatMap((segment) => segment.reps);
  const averageAdherence =
    segmentComparisons.reduce((sum, segment) => sum + segment.adherenceScore, 0) / segmentComparisons.length;
  const inferredRepCount = repComparisons.filter((rep) => rep.inferred).length;

  return {
    averageAdherence: roundScore(averageAdherence),
    inferredRepCount,
  };
}

function describeTerrainContext(importedWorkout: Doc<"healthKitWorkouts">): string {
  const paceMetrics = resolveWorkoutPaceMetrics(importedWorkout);
  if (!paceMetrics.hasMeaningfulGapDifference) {
    return "";
  }

  const hasElevation =
    typeof importedWorkout.elevationAscentMeters === "number" || typeof importedWorkout.elevationDescentMeters === "number";
  if (!hasElevation) {
    return "Terrain changed the raw pace meaningfully, so GAP is the better read for effort.";
  }

  return "Terrain changed the raw pace meaningfully, so GAP is the better read for effort on this route.";
}

function isStructuredImportedWorkout(workout: Doc<"healthKitWorkouts">): boolean {
  return (workout.intervalChains?.length ?? 0) > 0;
}

function isEligibleCandidateType(
  workout: Doc<"workouts">,
  structured: boolean,
): boolean {
  if (structured) {
    return workout.type === "tempo" || workout.type === "intervals";
  }

  return workout.type === "easyRun" || workout.type === "recovery" || workout.type === "longRun";
}

function resolveActualVolume(
  importedWorkout: Doc<"healthKitWorkouts">,
  volumeMode: Doc<"trainingPlans">["volumeMode"],
): number | undefined {
  if (volumeMode === "time") {
    return importedWorkout.durationSeconds;
  }

  return importedWorkout.distanceMeters;
}

function resolveVolumeScore(plannedAbsoluteVolume: number, actualAbsoluteVolume?: number): number {
  if (!Number.isFinite(plannedAbsoluteVolume) || plannedAbsoluteVolume <= 0) {
    return 0;
  }

  if (typeof actualAbsoluteVolume !== "number" || !Number.isFinite(actualAbsoluteVolume) || actualAbsoluteVolume <= 0) {
    return 0.15;
  }

  const ratio = Math.min(plannedAbsoluteVolume, actualAbsoluteVolume) / Math.max(plannedAbsoluteVolume, actualAbsoluteVolume);
  return Math.max(0, Math.min(1, ratio));
}

function resolveStructureScore(
  workout: Doc<"workouts">,
  structured: boolean,
): number {
  if (structured) {
    return workout.type === "intervals" ? 1 : 0.88;
  }

  if (workout.type === "longRun") {
    return 1;
  }

  return workout.type === "easyRun" ? 0.92 : 0.82;
}

function resolveDateScore(dateDelta: number): number {
  if (dateDelta === 0) {
    return 1;
  }

  return 0.62;
}

async function getExecutionByHealthKitWorkoutId(
  ctx: ReaderCtx,
  healthKitWorkoutId: Id<"healthKitWorkouts">,
): Promise<Doc<"workoutExecutions"> | null> {
  const executions = await ctx.db
    .query("workoutExecutions")
    .withIndex("by_healthkit_workout_id", (queryBuilder) =>
      queryBuilder.eq("healthKitWorkoutId", healthKitWorkoutId),
    )
    .collect();

  return executions[0] ?? null;
}

async function getExecutionByPlannedWorkoutId(
  ctx: ReaderCtx,
  plannedWorkoutId: Id<"workouts">,
): Promise<Doc<"workoutExecutions"> | null> {
  const executions = await ctx.db
    .query("workoutExecutions")
    .withIndex("by_planned_workout_id", (queryBuilder) =>
      queryBuilder.eq("plannedWorkoutId", plannedWorkoutId),
    )
    .collect();

  return executions[0] ?? null;
}

export async function listPlanWorkoutsWithWeeks(
  ctx: ReaderCtx,
  planId: Id<"trainingPlans">,
): Promise<Array<{ week: Doc<"trainingWeeks">; workout: Doc<"workouts"> }>> {
  const weeks = await ctx.db
    .query("trainingWeeks")
    .withIndex("by_plan_id", (queryBuilder) => queryBuilder.eq("planId", planId))
    .collect();

  const workoutsByWeek = await Promise.all(
    weeks.map(async (week) => ({
      week,
      workouts: await ctx.db
        .query("workouts")
        .withIndex("by_week_id", (queryBuilder) => queryBuilder.eq("weekId", week._id))
        .collect(),
    })),
  );

  return workoutsByWeek.flatMap(({ week, workouts }) =>
    workouts.map((workout) => ({
      week,
      workout,
    })),
  );
}

export async function getActivePlan(
  ctx: ReaderCtx,
  userId: Id<"users">,
): Promise<Doc<"trainingPlans"> | null> {
  const plans = await ctx.db
    .query("trainingPlans")
    .withIndex("by_user_id_status", (queryBuilder) =>
      queryBuilder.eq("userId", userId).eq("status", "active"),
    )
    .collect();

  return plans[0] ?? null;
}

async function findWeekForDateKey(
  ctx: ReaderCtx,
  planId: Id<"trainingPlans">,
  targetDateKey: DateKey,
): Promise<Doc<"trainingWeeks"> | null> {
  const weeks = await ctx.db
    .query("trainingWeeks")
    .withIndex("by_plan_id", (queryBuilder) => queryBuilder.eq("planId", planId))
    .collect();

  return (
    weeks.find(
      (week) => week.weekStartDateKey <= targetDateKey && week.weekEndDateKey >= targetDateKey,
    ) ?? null
  );
}

export async function listMatchCandidatesForImportedWorkout(
  ctx: ReaderCtx,
  args: {
    userId: Id<"users">;
    importedWorkout: Doc<"healthKitWorkouts">;
    plan: Doc<"trainingPlans"> | null;
    excludeExecutionId?: Id<"workoutExecutions">;
  },
): Promise<PlannedWorkoutCandidate[]> {
  if (!args.plan?.canonicalTimeZoneId) {
    return [];
  }

  const importedDateKey = dateKeyFromEpochMs(args.importedWorkout.startedAt, args.plan.canonicalTimeZoneId);
  if (!isDateWithinPlanWindow(args.plan, importedDateKey, 1)) {
    return [];
  }
  const planEntries = await listPlanWorkoutsWithWeeks(ctx, args.plan._id);
  const executions = await ctx.db
    .query("workoutExecutions")
    .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", args.userId))
    .collect();

  const linkedWorkoutIds = new Set(
    executions
      .filter(
        (execution) =>
          execution.plannedWorkoutId &&
          execution.matchStatus === "matched" &&
          execution._id !== args.excludeExecutionId,
      )
      .map((execution) => String(execution.plannedWorkoutId)),
  );

  const structured = isStructuredImportedWorkout(args.importedWorkout);
  const actualVolume = resolveActualVolume(args.importedWorkout, args.plan.volumeMode);

  return planEntries
    .filter(({ workout }) => !linkedWorkoutIds.has(String(workout._id)))
    .filter(({ workout }) => isEligibleCandidateType(workout, structured))
    .map(({ workout, week }) => {
      const dateDelta = Math.abs(diffDays(workout.scheduledDateKey as DateKey, importedDateKey));
      return {
        workout,
        week,
        dateDelta,
      };
    })
    .filter(({ dateDelta }) => dateDelta <= 1)
    .map(({ workout, week, dateDelta }) => {
      const dateScore = resolveDateScore(dateDelta);
      const volumeScore = resolveVolumeScore(workout.absoluteVolume, actualVolume);
      const structureScore = resolveStructureScore(workout, structured);
      const confidence = roundScore(dateScore * 0.5 + volumeScore * 0.4 + structureScore * 0.1);

      return {
        workout,
        week,
        confidence,
        dateDelta,
        matchDateKey: importedDateKey,
      };
    })
    .sort((left, right) => {
      if (right.confidence !== left.confidence) {
        return right.confidence - left.confidence;
      }

      if (left.dateDelta !== right.dateDelta) {
        return left.dateDelta - right.dateDelta;
      }

      return left.workout.scheduledDateKey.localeCompare(right.workout.scheduledDateKey);
    });
}

function resolveMatchDecision(
  candidates: PlannedWorkoutCandidate[],
): {
  status: Doc<"workoutExecutions">["matchStatus"];
  method: Doc<"workoutExecutions">["matchMethod"];
  bestCandidate: PlannedWorkoutCandidate | null;
} {
  if (candidates.length === 0) {
    return {
      status: "unmatched",
      method: "none",
      bestCandidate: null,
    };
  }

  const bestCandidate = candidates[0]!;
  const secondCandidate = candidates[1] ?? null;
  const clearLead = !secondCandidate || bestCandidate.confidence - secondCandidate.confidence >= 0.12;

  if (bestCandidate.confidence >= 0.82 && clearLead) {
    return {
      status: "matched",
      method: "auto",
      bestCandidate,
    };
  }

  return {
    status: "needsReview",
    method: "none",
    bestCandidate,
  };
}

function buildExecutionSummary(
  execution: Doc<"workoutExecutions">,
  importedWorkout: Doc<"healthKitWorkouts">,
) {
  return {
    _id: execution._id,
    healthKitWorkoutId: execution.healthKitWorkoutId,
    plannedWorkoutId: execution.plannedWorkoutId ?? null,
    matchStatus: execution.matchStatus,
    matchMethod: execution.matchMethod,
    matchConfidence: execution.matchConfidence ?? null,
    checkInStatus: execution.checkInStatus,
    actualStartedAt: importedWorkout.startedAt,
    actualEndedAt: importedWorkout.endedAt,
    actualDurationSeconds: importedWorkout.durationSeconds,
    actualDistanceMeters: importedWorkout.distanceMeters,
    actualRawPaceSecondsPerMeter: importedWorkout.rawPaceSecondsPerMeter ?? null,
    actualGradeAdjustedPaceSecondsPerMeter: importedWorkout.gradeAdjustedPaceSecondsPerMeter ?? null,
    elevationAscentMeters: importedWorkout.elevationAscentMeters ?? null,
    elevationDescentMeters: importedWorkout.elevationDescentMeters ?? null,
    actualAverageHeartRate: importedWorkout.averageHeartRate,
    rpe: execution.rpe ?? null,
    modifiers: execution.modifiers,
    customModifierText: execution.customModifierText,
    notes: execution.notes,
    feedback: {
      status: execution.feedbackStatus,
      commentary: execution.feedbackCommentary,
      adjustments: execution.feedbackAdjustments,
    },
  };
}

export async function listExecutionSummariesByHealthKitWorkoutId(
  ctx: ReaderCtx,
  userId: Id<"users">,
): Promise<Map<string, ReturnType<typeof buildExecutionSummary>>> {
  const executions = await ctx.db
    .query("workoutExecutions")
    .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
    .collect();

  const importedWorkouts = await Promise.all(executions.map((execution) => ctx.db.get(execution.healthKitWorkoutId)));
  const summaryByHealthKitWorkoutId = new Map<string, ReturnType<typeof buildExecutionSummary>>();

  executions.forEach((execution, index) => {
    const importedWorkout = importedWorkouts[index];
    if (!importedWorkout) {
      return;
    }

    summaryByHealthKitWorkoutId.set(
      String(importedWorkout._id),
      buildExecutionSummary(execution, importedWorkout),
    );
  });

  return summaryByHealthKitWorkoutId;
}

export async function listExecutionSummariesByPlannedWorkoutId(
  ctx: ReaderCtx,
  userId: Id<"users">,
): Promise<Map<string, ReturnType<typeof buildExecutionSummary>>> {
  const executions = await ctx.db
    .query("workoutExecutions")
    .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
    .collect();

  const matchedExecutions = executions.filter((execution) => execution.plannedWorkoutId && execution.matchStatus === "matched");
  const importedWorkouts = await Promise.all(
    matchedExecutions.map((execution) => ctx.db.get(execution.healthKitWorkoutId)),
  );
  const summaryByPlannedWorkoutId = new Map<string, ReturnType<typeof buildExecutionSummary>>();

  matchedExecutions.forEach((execution, index) => {
    const importedWorkout = importedWorkouts[index];
    if (!importedWorkout || !execution.plannedWorkoutId) {
      return;
    }

    summaryByPlannedWorkoutId.set(
      String(execution.plannedWorkoutId),
      buildExecutionSummary(execution, importedWorkout),
    );
  });

  return summaryByPlannedWorkoutId;
}

async function buildUpcomingWorkoutContext(
  ctx: ReaderCtx,
  planId: Id<"trainingPlans">,
  afterDateKey: DateKey,
): Promise<Doc<"workouts">[]> {
  const entries = await listPlanWorkoutsWithWeeks(ctx, planId);

  return entries
    .map((entry) => entry.workout)
    .filter(
      (workout) =>
        workout.scheduledDateKey >= afterDateKey &&
        workout.scheduledDateKey <= addDays(afterDateKey, 2),
    )
    .sort((left, right) => left.scheduledDateKey.localeCompare(right.scheduledDateKey));
}

async function generateFeedback(
  ctx: ReaderCtx,
  execution: Doc<"workoutExecutions">,
): Promise<{ commentary: string; adjustments: string[]; planId?: Id<"trainingPlans"> }> {
  const [importedWorkout, user, plannedWorkout] = await Promise.all([
    ctx.db.get(execution.healthKitWorkoutId),
    ctx.db.get(execution.userId),
    execution.plannedWorkoutId ? ctx.db.get(execution.plannedWorkoutId) : Promise.resolve(null),
  ]);

  if (!importedWorkout) {
    throw new Error("Imported workout not found for execution.");
  }

  const plan =
    execution.planId ? await ctx.db.get(execution.planId) : await getActivePlan(ctx, execution.userId);
  const adjustments: string[] = [];
  const notes: string[] = [];

  const hasSubjectiveInput =
    execution.checkInStatus === "submitted" &&
    (typeof execution.rpe === "number" ||
      execution.modifiers.length > 0 ||
      Boolean(execution.customModifierText?.trim()) ||
      Boolean(execution.notes?.trim()));

  if (!hasSubjectiveInput) {
    notes.push("Subjective feedback was not provided, so this read is based on duration, distance, and heart rate only.");
  }

  if (execution.modifiers.length > 0 || execution.customModifierText?.trim()) {
    const modifierSummary = execution.modifiers.map(formatModifier);
    if (execution.customModifierText?.trim()) {
      modifierSummary.push(execution.customModifierText.trim());
    }
    notes.push(`Context noted: ${modifierSummary.join(", ")}.`);
  }

  const hrRatio =
    typeof importedWorkout.averageHeartRate === "number" &&
    typeof user?.maxHeartRate === "number" &&
    user.maxHeartRate > 0
      ? importedWorkout.averageHeartRate / user.maxHeartRate
      : null;
  const paceMetrics = resolveWorkoutPaceMetrics(importedWorkout);
  const terrainContext = describeTerrainContext(importedWorkout);
  const segmentComparisons = buildSegmentComparisons(plannedWorkout, importedWorkout, user?.currentVDOT ?? null);
  const structuredSummary = summarizeStructuredComparisons(segmentComparisons);

  if (!plannedWorkout || !plan) {
    const planId = plan?._id;
    const importedDateKey =
      plan?.canonicalTimeZoneId
        ? dateKeyFromEpochMs(importedWorkout.startedAt, plan.canonicalTimeZoneId)
        : null;

    if (planId && importedDateKey) {
      const upcoming = await buildUpcomingWorkoutContext(ctx, planId, importedDateKey);
      const nextDemanding = upcoming.find(
        (workout) =>
          workout.scheduledDateKey > importedDateKey &&
          (workout.type === "longRun" || workout.type === "tempo" || workout.type === "intervals"),
      );

      if (nextDemanding) {
        adjustments.push(
          `Count this as extra load before ${formatWorkoutType(nextDemanding.type)} on ${nextDemanding.scheduledDateKey}. Keep that session conservative if your legs still feel flat.`,
        );
      }
    }

    return {
      commentary: [
        "This run is currently treated as unplanned extra volume.",
        "Let it count, but do not compensate by adding even more mileage on top of it.",
        terrainContext,
        ...notes,
      ].join(" "),
      adjustments,
      planId,
    };
  }

  const actualVolume = resolveActualVolume(importedWorkout, plan.volumeMode);
  const completionRatio =
    typeof actualVolume === "number" && plannedWorkout.absoluteVolume > 0
      ? actualVolume / plannedWorkout.absoluteVolume
      : null;
  const highRpe = typeof execution.rpe === "number" && execution.rpe >= 7;
  const lowToModerateRpe = typeof execution.rpe === "number" ? execution.rpe <= 7 : true;
  const elevatedHeartRate = typeof hrRatio === "number" && hrRatio >= 0.78;
  const workoutLabel = formatWorkoutType(plannedWorkout.type);

  if (plannedWorkout.type === "easyRun" || plannedWorkout.type === "recovery") {
    if (highRpe || elevatedHeartRate) {
      adjustments.push("Protect the next easy day. Keep it truly easy and cut it short if effort stays unusually high.");
      return {
        commentary: [
          `This ${workoutLabel} was completed, but the effort looked heavier than planned.`,
          elevatedHeartRate ? "Average heart rate sat above a normal easy-day range." : "",
          highRpe ? `You also tagged it at RPE ${execution.rpe}/10.` : "",
          terrainContext
            ? "The hills explain part of the slower raw pace, but the corrected effort still looks hot for an easy day."
            : "",
          "That combination usually points to accumulating fatigue more than missed fitness.",
          ...notes,
        ]
          .filter(Boolean)
          .join(" "),
        adjustments,
        planId: plan._id,
      };
    }

    return {
      commentary: [
        `This ${workoutLabel} stayed close to plan.`,
        terrainContext,
        "Nothing here suggests a change in direction.",
        ...notes,
      ].join(" "),
      adjustments,
      planId: plan._id,
    };
  }

  if (plannedWorkout.type === "longRun") {
    if (typeof completionRatio === "number" && completionRatio < 0.75) {
      adjustments.push("Do not try to make up the lost long-run volume in one shot. Return to the plan and let the week normalize.");
      return {
        commentary: [
          "This long run came up noticeably short of the planned volume.",
          terrainContext,
          "Treat it as information, not a debt that needs immediate repayment.",
          ...notes,
        ].join(" "),
        adjustments,
        planId: plan._id,
      };
    }

    return {
      commentary: [
        "This long run landed close enough to plan to keep the week moving forward.",
        terrainContext,
        ...notes,
      ].join(" "),
      adjustments,
      planId: plan._id,
    };
  }

  if (plannedWorkout.type === "tempo" || plannedWorkout.type === "intervals") {
    if (structuredSummary && lowToModerateRpe && structuredSummary.averageAdherence >= 0.78) {
      return {
        commentary: [
          `This ${workoutLabel} matched the prescribed reps well.`,
          structuredSummary.inferredRepCount > 0 ? "A few rep boundaries were reconstructed from the recorded interval data." : "",
          terrainContext,
          "That is a good sign that the current targets are appropriate.",
          ...notes,
        ].join(" "),
        adjustments,
        planId: plan._id,
      };
    }

    if (structuredSummary && structuredSummary.averageAdherence < 0.6) {
      if (highRpe) {
        adjustments.push("Hold the next hard session to the plan. Do not add extra volume on top of a hard-feeling day.");
      }

      return {
        commentary: [
          `This ${workoutLabel} drifted away from the prescribed rep targets.`,
          terrainContext
            ? "Even after correcting the route with GAP, the rep execution still looks off the intended pace."
            : "",
          highRpe ? `RPE was ${execution.rpe}/10, which supports the read that the session ran harder than planned.` : "",
          ...notes,
        ]
          .filter(Boolean)
          .join(" "),
        adjustments,
        planId: plan._id,
      };
    }

    if (lowToModerateRpe && (typeof completionRatio !== "number" || completionRatio >= 0.9)) {
      return {
        commentary: [
          `This ${workoutLabel} was close to the prescribed volume and the effort stayed controlled.`,
          terrainContext,
          "That is a good sign that the current targets are appropriate.",
          ...notes,
        ]
          .filter(Boolean)
          .join(" "),
        adjustments,
        planId: plan._id,
      };
    }
  }

  if (highRpe) {
    adjustments.push("Hold the next hard session to the plan. Do not add extra volume on top of a hard-feeling day.");
  }

  return {
    commentary: [
      `This ${workoutLabel} was logged against the plan.`,
      typeof execution.rpe === "number" ? `RPE came in at ${execution.rpe}/10.` : "",
      paceMetrics.preferredPaceSource === "gap" ? "Pace evaluation used GAP because terrain materially changed the raw pace." : "",
      "Use the next few runs to confirm whether this was a one-day blip or the start of a fatigue trend.",
      ...notes,
    ]
      .filter(Boolean)
      .join(" "),
    adjustments,
    planId: plan._id,
  };
}

export async function regenerateFeedbackForExecution(
  ctx: MutationCtx,
  executionId: Id<"workoutExecutions">,
): Promise<void> {
  const execution = await ctx.db.get(executionId);
  if (!execution) {
    throw new Error("Workout execution not found.");
  }

  const importedWorkout = await ctx.db.get(execution.healthKitWorkoutId);
  if (!importedWorkout) {
    throw new Error("Imported workout not found for execution.");
  }

  const feedback = await generateFeedback(ctx, execution);
  const currentAdjustments = execution.feedbackAdjustments ?? [];
  const feedbackChanged =
    execution.feedbackCommentary !== feedback.commentary || !arraysEqual(currentAdjustments, feedback.adjustments);

  await ctx.db.patch(execution._id, {
    feedbackStatus: "ready",
    feedbackCommentary: feedback.commentary,
    feedbackAdjustments: feedback.adjustments,
    updatedAt: Date.now(),
  });

  if (!feedbackChanged) {
    return;
  }

  const shouldPostCoachMessage =
    execution.checkInStatus === "submitted" ||
    importedWorkout.startedAt >= Date.now() - 7 * 24 * 60 * 60 * 1000;

  if (!shouldPostCoachMessage) {
    return;
  }

  const body =
    feedback.adjustments.length > 0
      ? `${feedback.commentary} Next steps: ${feedback.adjustments.join(" ")}`
      : feedback.commentary;

  await ctx.db.insert("coachMessages", {
    userId: execution.userId,
    author: "coach",
    kind: "message",
    body,
    planId: feedback.planId,
    createdAt: Date.now(),
  });
}

export async function reconcileImportedWorkoutExecution(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    healthKitWorkoutId: Id<"healthKitWorkouts">;
  },
): Promise<Id<"workoutExecutions">> {
  const importedWorkout = await ctx.db.get(args.healthKitWorkoutId);
  if (!importedWorkout || importedWorkout.userId !== args.userId) {
    throw new Error("Imported workout not found for user.");
  }

  const now = Date.now();
  const existingExecution = await getExecutionByHealthKitWorkoutId(ctx, importedWorkout._id);

  if (existingExecution?.plannedWorkoutId) {
    const plannedWorkout = await ctx.db.get(existingExecution.plannedWorkoutId);
    if (plannedWorkout) {
      await ctx.db.patch(existingExecution._id, {
        feedbackStatus: "pending",
        updatedAt: now,
      });
      await regenerateFeedbackForExecution(ctx, existingExecution._id);
      return existingExecution._id;
    }
  }

  const activePlan = await getActivePlan(ctx, args.userId);
  const matchDateKey =
    activePlan?.canonicalTimeZoneId
      ? dateKeyFromEpochMs(importedWorkout.startedAt, activePlan.canonicalTimeZoneId)
      : undefined;
  const planForExecution =
    activePlan && matchDateKey && isDateWithinPlanWindow(activePlan, matchDateKey)
      ? activePlan
      : null;
  const candidates = await listMatchCandidatesForImportedWorkout(ctx, {
    userId: args.userId,
    importedWorkout,
    plan: planForExecution,
    excludeExecutionId: existingExecution?._id,
  });
  const decision = resolveMatchDecision(candidates);
  const matchedWeek =
    decision.bestCandidate?.week ??
    (planForExecution && matchDateKey ? await findWeekForDateKey(ctx, planForExecution._id, matchDateKey) : null);

  const payload = {
    userId: args.userId,
    healthKitWorkoutId: importedWorkout._id,
    planId: planForExecution?._id,
    weekId: matchedWeek?._id,
    plannedWorkoutId: decision.bestCandidate && decision.status === "matched" ? decision.bestCandidate.workout._id : undefined,
    matchStatus: decision.status,
    matchMethod: decision.status === "matched" ? decision.method : "none",
    matchConfidence: decision.bestCandidate?.confidence,
    matchDateKey,
    checkInStatus: existingExecution?.checkInStatus ?? "pending",
    rpe: existingExecution?.rpe,
    modifiers: existingExecution?.modifiers ?? [],
    customModifierText: existingExecution?.customModifierText,
    notes: existingExecution?.notes,
    feedbackStatus: "pending" as const,
    feedbackCommentary: existingExecution?.feedbackCommentary,
    feedbackAdjustments: existingExecution?.feedbackAdjustments ?? [],
    updatedAt: now,
  };

  const executionId = existingExecution
    ? existingExecution._id
    : await ctx.db.insert("workoutExecutions", {
        ...payload,
        createdAt: now,
      });

  if (existingExecution) {
    await ctx.db.patch(existingExecution._id, payload);
  }

  await regenerateFeedbackForExecution(ctx, executionId);
  return executionId;
}

export async function getExecutionDetailRecord(
  ctx: ReaderCtx,
  userId: Id<"users">,
  executionId: Id<"workoutExecutions">,
) {
  const execution = await ctx.db.get(executionId);
  if (!execution || execution.userId !== userId) {
    return null;
  }

  const [importedWorkout, plannedWorkout, plan, user] = await Promise.all([
    ctx.db.get(execution.healthKitWorkoutId),
    execution.plannedWorkoutId ? ctx.db.get(execution.plannedWorkoutId) : Promise.resolve(null),
    execution.planId ? ctx.db.get(execution.planId) : Promise.resolve(null),
    ctx.db.get(execution.userId),
  ]);

  if (!importedWorkout) {
    return null;
  }

  const segmentComparisons = buildSegmentComparisons(plannedWorkout, importedWorkout, user?.currentVDOT ?? null);

  return {
    execution: buildExecutionSummary(execution, importedWorkout),
    importedWorkout: {
      _id: importedWorkout._id,
      startedAt: importedWorkout.startedAt,
      endedAt: importedWorkout.endedAt,
      durationSeconds: importedWorkout.durationSeconds,
      distanceMeters: importedWorkout.distanceMeters,
      rawPaceSecondsPerMeter: importedWorkout.rawPaceSecondsPerMeter,
      gradeAdjustedPaceSecondsPerMeter: importedWorkout.gradeAdjustedPaceSecondsPerMeter,
      elevationAscentMeters: importedWorkout.elevationAscentMeters,
      elevationDescentMeters: importedWorkout.elevationDescentMeters,
      averageHeartRate: importedWorkout.averageHeartRate,
      maxHeartRate: importedWorkout.maxHeartRate,
      intervalChains: importedWorkout.intervalChains,
      sourceName: importedWorkout.sourceName,
      sourceBundleIdentifier: importedWorkout.sourceBundleIdentifier,
    },
    plannedWorkout: plannedWorkout
      ? {
          _id: plannedWorkout._id,
          type: plannedWorkout.type,
          volumePercent: plannedWorkout.volumePercent,
          absoluteVolume: plannedWorkout.absoluteVolume,
          scheduledDateKey: plannedWorkout.scheduledDateKey,
          notes: plannedWorkout.notes,
          venue: plannedWorkout.venue,
          segments: plannedWorkout.segments,
        }
      : null,
    segmentComparisons,
    plan: plan
      ? {
          _id: plan._id,
          volumeMode: plan.volumeMode,
          canonicalTimeZoneId: plan.canonicalTimeZoneId ?? null,
        }
      : null,
  };
}

export async function getMatchCandidateRecords(
  ctx: ReaderCtx,
  args: {
    userId: Id<"users">;
    healthKitWorkoutId: Id<"healthKitWorkouts">;
    excludeExecutionId?: Id<"workoutExecutions">;
  },
) {
  const importedWorkout = await ctx.db.get(args.healthKitWorkoutId);
  if (!importedWorkout || importedWorkout.userId !== args.userId) {
    return [];
  }

  const activePlan = await getActivePlan(ctx, args.userId);
  const candidates = await listMatchCandidatesForImportedWorkout(ctx, {
    userId: args.userId,
    importedWorkout,
    plan: activePlan,
    excludeExecutionId: args.excludeExecutionId,
  });

  return candidates.map((candidate) => ({
    plannedWorkoutId: candidate.workout._id,
    weekId: candidate.week._id,
    weekNumber: candidate.week.weekNumber,
    scheduledDateKey: candidate.workout.scheduledDateKey,
    type: candidate.workout.type,
    absoluteVolume: candidate.workout.absoluteVolume,
    volumePercent: candidate.workout.volumePercent,
    venue: candidate.workout.venue,
    notes: candidate.workout.notes,
    confidence: candidate.confidence,
  }));
}

export async function linkExecutionToPlannedWorkout(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    healthKitWorkoutId: Id<"healthKitWorkouts">;
    plannedWorkoutId: Id<"workouts">;
  },
): Promise<Id<"workoutExecutions">> {
  const [importedWorkout, plannedWorkout] = await Promise.all([
    ctx.db.get(args.healthKitWorkoutId),
    ctx.db.get(args.plannedWorkoutId),
  ]);

  if (!importedWorkout || importedWorkout.userId !== args.userId) {
    throw new Error("Imported workout not found for user.");
  }

  if (!plannedWorkout) {
    throw new Error("Planned workout not found.");
  }

  const week = await ctx.db.get(plannedWorkout.weekId);
  if (!week) {
    throw new Error("Training week not found for planned workout.");
  }

  const plan = await ctx.db.get(week.planId);
  if (!plan || plan.userId !== args.userId || plan.status !== "active") {
    throw new Error("Planned workout must belong to the user's active plan.");
  }

  const existingLinkedExecution = await getExecutionByPlannedWorkoutId(ctx, plannedWorkout._id);
  const currentExecution = await getExecutionByHealthKitWorkoutId(ctx, importedWorkout._id);
  if (existingLinkedExecution && existingLinkedExecution._id !== currentExecution?._id) {
    throw new Error("That planned workout is already linked to another imported run.");
  }

  const matchDateKey = plan.canonicalTimeZoneId
    ? dateKeyFromEpochMs(importedWorkout.startedAt, plan.canonicalTimeZoneId)
    : undefined;
  const candidates = await listMatchCandidatesForImportedWorkout(ctx, {
    userId: args.userId,
    importedWorkout,
    plan,
    excludeExecutionId: currentExecution?._id,
  });
  const candidate = candidates.find((entry) => entry.workout._id === plannedWorkout._id) ?? null;
  const now = Date.now();

  const payload = {
    userId: args.userId,
    healthKitWorkoutId: importedWorkout._id,
    planId: plan._id,
    weekId: week._id,
    plannedWorkoutId: plannedWorkout._id,
    matchStatus: "matched" as const,
    matchMethod: "manual" as const,
    matchConfidence: candidate?.confidence,
    matchDateKey,
    checkInStatus: currentExecution?.checkInStatus ?? "pending",
    rpe: currentExecution?.rpe,
    modifiers: currentExecution?.modifiers ?? [],
    customModifierText: currentExecution?.customModifierText,
    notes: currentExecution?.notes,
    feedbackStatus: "pending" as const,
    feedbackCommentary: currentExecution?.feedbackCommentary,
    feedbackAdjustments: currentExecution?.feedbackAdjustments ?? [],
    updatedAt: now,
  };

  const executionId = currentExecution
    ? currentExecution._id
    : await ctx.db.insert("workoutExecutions", {
        ...payload,
        createdAt: now,
      });

  if (currentExecution) {
    await ctx.db.patch(currentExecution._id, payload);
  }

  await regenerateFeedbackForExecution(ctx, executionId);
  return executionId;
}

export async function unlinkExecution(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    executionId: Id<"workoutExecutions">;
  },
): Promise<void> {
  const execution = await ctx.db.get(args.executionId);
  if (!execution || execution.userId !== args.userId) {
    throw new Error("Workout execution not found for user.");
  }

  await ctx.db.patch(execution._id, {
    planId: undefined,
    weekId: undefined,
    plannedWorkoutId: undefined,
    matchStatus: "unmatched",
    matchMethod: "none",
    matchConfidence: undefined,
    matchDateKey: undefined,
    feedbackStatus: "pending",
    updatedAt: Date.now(),
  });

  await regenerateFeedbackForExecution(ctx, execution._id);
}
