import { WorkflowManager } from "@convex-dev/workflow";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

import { components, internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { validatePlanAssessmentResponse, type PlanAssessmentProposal } from "./assessmentContracts";
import { describeAiError, parseJsonPayloadFromModel } from "./aiHelpers";
import {
  assessmentAgent,
  buildAssessmentInstructions,
  coachAgent,
  buildCoachInstructions,
  weekBuilderAgent,
} from "./agentRuntime";
import { buildPlanAssessmentMessages, buildWeekDetailGenerationMessages } from "./coachPrompts";
import { validateWeekDetailResponse, type WeekDetailWorkoutProposal } from "./weekDetailContracts";
import { aiCallTypes, aiRequestPriorities, aiRequestStatuses, volumeModes } from "./constants";
import { deriveCurrentWeekNumber, isWeekGeneratable, resolveAbsoluteWeekVolume } from "./planWeeks";
import { listExecutionSummariesByPlannedWorkoutId } from "./workoutExecutionHelpers";
import { dateKeyFromEpochMs } from "../packages/domain/src/calendar";

const WEEK_DETAIL_PROMPT_REVISION = "week-detail-v2";
const WEEK_DETAIL_SCHEMA_REVISION = "week-detail-v2";
const PLAN_ASSESSMENT_PROMPT_REVISION = "plan-assessment-v1";
const PLAN_ASSESSMENT_SCHEMA_REVISION = "plan-assessment-v1";
const workflow = new WorkflowManager(components.workflow);
const globalWorkflowFlags = globalThis as typeof globalThis & {
  __SLOPMILES_DISABLE_WORKFLOWS__?: boolean;
};

function trimNonEmpty(value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error("Goal label cannot be empty.");
  }
  return normalized;
}

function formatVolumeSummary(volumeMode: (typeof volumeModes)[number], peakWeekVolume: number): string {
  return `${Math.round(peakWeekVolume)} ${volumeMode === "time" ? "min" : "m"}`;
}

function buildCoachSupportMessage(args: {
  personalityDescription: string;
  competitiveness: string;
  activePlan:
    | {
        goalLabel: string;
        numberOfWeeks: number;
        volumeMode: (typeof volumeModes)[number];
        peakWeekVolume: number;
      }
    | null;
  runningSchedule:
    | {
        preferredRunningDays: string[];
        runningDaysPerWeek: number;
        preferredLongRunDay?: string;
      }
    | null;
  currentVDOT?: number;
}): string {
  return [
    "Runner context:",
    `Personality: ${args.personalityDescription}.`,
    `Competitiveness: ${args.competitiveness}.`,
    `Current VDOT: ${typeof args.currentVDOT === "number" ? args.currentVDOT.toFixed(1) : "unknown"}.`,
    args.activePlan
      ? `Active plan: ${args.activePlan.goalLabel}, ${args.activePlan.numberOfWeeks} weeks, peak ${formatVolumeSummary(args.activePlan.volumeMode, args.activePlan.peakWeekVolume)}.`
      : "Active plan: none.",
    args.runningSchedule
      ? `Running schedule: ${args.runningSchedule.runningDaysPerWeek} days per week across ${args.runningSchedule.preferredRunningDays.join(", ")}${args.runningSchedule.preferredLongRunDay ? `, long run preference ${args.runningSchedule.preferredLongRunDay}` : ""}.`
      : "Running schedule: not configured.",
    "Use this context to answer the user's latest message practically and conversationally.",
  ].join("\n");
}

async function requireAuthenticatedQueryUserId(ctx: QueryCtx): Promise<Id<"users">> {
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
  relatedRequestId?: Id<"aiRequests">,
) {
  await ctx.db.insert("coachMessages", {
    userId,
    author: "coach",
    kind: "event",
    body,
    planId,
    relatedRequestId,
    createdAt: Date.now(),
  });
}

async function startAiWorkflow(
  ctx: MutationCtx,
  workflowReference:
    | typeof internal.coach.runWeekDetailGenerationWorkflow
    | typeof internal.coach.runPlanAssessmentWorkflow,
  args: {
    requestId: Id<"aiRequests">;
  },
): Promise<void> {
  if (globalWorkflowFlags.__SLOPMILES_DISABLE_WORKFLOWS__ === true) {
    return;
  }
  try {
    await workflow.start(ctx, workflowReference, args);
  } catch (error) {
    const message = describeAiError(error);
    if (message.includes("setTimeout isn't supported within workflows yet")) {
      return;
    }
    throw error;
  }
}

function createWeekDetailDedupeKey(input: {
  planId: Id<"trainingPlans">;
  weekNumber: number;
}): string {
  return [
    "weekDetailGeneration",
    input.planId,
    input.weekNumber,
    WEEK_DETAIL_PROMPT_REVISION,
    WEEK_DETAIL_SCHEMA_REVISION,
  ].join("|");
}

function createPlanAssessmentDedupeKey(input: {
  planId: Id<"trainingPlans">;
}): string {
  return [
    "planAssessment",
    input.planId,
    PLAN_ASSESSMENT_PROMPT_REVISION,
    PLAN_ASSESSMENT_SCHEMA_REVISION,
  ].join("|");
}

function asWeekDetailInput(
  value: unknown,
): {
  planId: Id<"trainingPlans">;
  weekNumber: number;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid week-detail request input payload.");
  }

  const candidate = value as Record<string, unknown>;
  const planId = candidate.planId as Id<"trainingPlans"> | undefined;
  const weekNumber = typeof candidate.weekNumber === "number" ? Math.round(candidate.weekNumber) : undefined;
  if (!planId || typeof planId !== "string" || !weekNumber || weekNumber < 1) {
    throw new Error("Week-detail input requires planId and positive weekNumber.");
  }

  return {
    planId,
    weekNumber,
  };
}

function asPlanAssessmentInput(
  value: unknown,
): {
  planId: Id<"trainingPlans">;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid plan-assessment request input payload.");
  }

  const candidate = value as Record<string, unknown>;
  const planId = candidate.planId as Id<"trainingPlans"> | undefined;
  if (!planId || typeof planId !== "string") {
    throw new Error("Plan-assessment input requires planId.");
  }

  return {
    planId,
  };
}

function asMetadata(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
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

function effectivePreferredRunningDays(
  runningSchedule:
    | {
        preferredRunningDays: string[];
      }
    | null,
  availabilityOverride:
    | {
        preferredRunningDays?: string[];
      }
    | null,
): string[] {
  const overrideDays = availabilityOverride?.preferredRunningDays?.filter((entry) => typeof entry === "string") ?? [];
  if (overrideDays.length > 0) {
    return overrideDays;
  }

  const scheduleDays = runningSchedule?.preferredRunningDays ?? [];
  if (scheduleDays.length > 0) {
    return scheduleDays;
  }

  return [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ];
}

function resolveWeekVolumeTargetMode(args: {
  availabilityOverride: ReturnType<typeof normalizeAvailabilityOverride>;
  interruptionType?: string;
  racesInWeekCount: number;
}): "exact" | "upToTarget" {
  if (args.racesInWeekCount > 0 || args.interruptionType || args.availabilityOverride) {
    return "upToTarget";
  }

  return "exact";
}

function extractStoredPlanAssessment(value: unknown): PlanAssessmentProposal | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as {
    summary?: unknown;
    volumeAdherence?: unknown;
    paceAdherence?: unknown;
    vdotStart?: unknown;
    vdotEnd?: unknown;
    highlights?: unknown;
    areasForImprovement?: unknown;
    nextPlanSuggestion?: unknown;
    discussionPrompts?: unknown;
  };

  if (
    typeof candidate.summary !== "string" ||
    typeof candidate.volumeAdherence !== "number" ||
    typeof candidate.paceAdherence !== "number" ||
    typeof candidate.vdotStart !== "number" ||
    typeof candidate.vdotEnd !== "number" ||
    !Array.isArray(candidate.highlights) ||
    !Array.isArray(candidate.areasForImprovement) ||
    typeof candidate.nextPlanSuggestion !== "string" ||
    !Array.isArray(candidate.discussionPrompts)
  ) {
    return null;
  }

  return {
    summary: candidate.summary,
    volumeAdherence: candidate.volumeAdherence,
    paceAdherence: candidate.paceAdherence,
    vdotStart: candidate.vdotStart,
    vdotEnd: candidate.vdotEnd,
    highlights: candidate.highlights.filter((entry): entry is string => typeof entry === "string"),
    areasForImprovement: candidate.areasForImprovement.filter((entry): entry is string => typeof entry === "string"),
    nextPlanSuggestion: candidate.nextPlanSuggestion,
    discussionPrompts: candidate.discussionPrompts.filter((entry): entry is string => typeof entry === "string"),
  };
}

export const requestWeekDetailGeneration = mutation({
  args: {
    planId: v.id("trainingPlans"),
    weekNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedMutationUserId(ctx);
    const plan = await ctx.db.get(args.planId);
    if (!plan || plan.userId !== userId) {
      throw new Error("Plan not found for user.");
    }
    if (plan.status !== "active") {
      throw new Error("Week details can only be generated for an active plan.");
    }
    if (!plan.startDateKey || !plan.canonicalTimeZoneId) {
      throw new Error("Active plan is missing canonical week metadata.");
    }

    const weekNumber = Math.round(args.weekNumber);
    if (!isWeekGeneratable(plan, weekNumber, Date.now())) {
      throw new Error("Only the current week and next week can be generated.");
    }

    const week = await ctx.db
      .query("trainingWeeks")
      .withIndex("by_plan_id_week_number", (queryBuilder) =>
        queryBuilder.eq("planId", plan._id).eq("weekNumber", weekNumber),
      )
      .unique();
    if (!week) {
      throw new Error("Training week not found.");
    }

    const dedupeKey = createWeekDetailDedupeKey({
      planId: plan._id,
      weekNumber,
    });
    const existing = await ctx.db
      .query("aiRequests")
      .withIndex("by_user_id_call_type_dedupe_key", (queryBuilder) =>
        queryBuilder.eq("userId", userId).eq("callType", "weekDetailGeneration").eq("dedupeKey", dedupeKey),
      )
      .collect();

    const inFlight = existing.find((request) => request.status === "queued" || request.status === "inProgress");
    if (inFlight) {
      return {
        requestId: inFlight._id,
        status: inFlight.status,
        deduped: true,
      };
    }

    const now = Date.now();
    const requestId = await ctx.db.insert("aiRequests", {
      userId,
      callType: aiCallTypes[1],
      status: aiRequestStatuses[0],
      priority: aiRequestPriorities[0],
      dedupeKey,
      input: {
        planId: plan._id,
        weekNumber,
      },
      attemptCount: 0,
      maxAttempts: 1,
      promptRevision: WEEK_DETAIL_PROMPT_REVISION,
      schemaRevision: WEEK_DETAIL_SCHEMA_REVISION,
      createdAt: now,
      updatedAt: now,
    });

    await insertCoachEvent(
      ctx,
      userId,
      `Generating workouts for week ${week.weekNumber}.`,
      plan._id,
      requestId,
    );

    await startAiWorkflow(ctx, internal.coach.runWeekDetailGenerationWorkflow, {
      requestId,
    });

    return {
      requestId,
      status: "queued" as const,
      deduped: false,
    };
  },
});

export const enqueuePlanAssessmentRequest = internalMutation({
  args: {
    planId: v.id("trainingPlans"),
  },
  handler: async (ctx, args) => {
    const plan = await ctx.db.get(args.planId);
    if (!plan) {
      throw new Error("Plan not found.");
    }

    const dedupeKey = createPlanAssessmentDedupeKey({
      planId: plan._id,
    });
    const existing = await ctx.db
      .query("aiRequests")
      .withIndex("by_user_id_call_type_dedupe_key", (queryBuilder) =>
        queryBuilder.eq("userId", plan.userId).eq("callType", "planAssessment").eq("dedupeKey", dedupeKey),
      )
      .collect();

    const inFlight = existing.find((request) => request.status === "queued" || request.status === "inProgress");
    if (inFlight) {
      return {
        requestId: inFlight._id,
        status: inFlight.status,
        deduped: true,
      };
    }

    const now = Date.now();
    const requestId = await ctx.db.insert("aiRequests", {
      userId: plan.userId,
      callType: aiCallTypes[2],
      status: aiRequestStatuses[0],
      priority: aiRequestPriorities[2],
      dedupeKey,
      input: {
        planId: plan._id,
      },
      attemptCount: 0,
      maxAttempts: 3,
      promptRevision: PLAN_ASSESSMENT_PROMPT_REVISION,
      schemaRevision: PLAN_ASSESSMENT_SCHEMA_REVISION,
      createdAt: now,
      updatedAt: now,
    });

    await startAiWorkflow(ctx, internal.coach.runPlanAssessmentWorkflow, {
      requestId,
    });

    return {
      requestId,
      status: "queued" as const,
      deduped: false,
    };
  },
});

export const sendCoachMessage = mutation({
  args: {
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedMutationUserId(ctx);
    const body = trimNonEmpty(args.body);
    const plans = await ctx.db
      .query("trainingPlans")
      .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
      .collect();

    const activePlan = plans.find((plan) => plan.status === "active") ?? null;
    const existingThread =
      (
        await ctx.db
          .query("agentThreadRegistry")
          .withIndex("by_user_id_kind", (queryBuilder) =>
            queryBuilder.eq("userId", userId).eq("kind", "coach"),
          )
          .take(1)
      )[0] ?? null;

    await ctx.db.insert("coachMessages", {
      userId,
      author: "user",
      kind: "message",
      body,
      planId: activePlan?._id,
      createdAt: Date.now(),
    });

    const threadId =
      existingThread?.threadId ??
      (
        await coachAgent.createThread(ctx, {
          userId: String(userId),
          title: "Coach",
        })
      ).threadId;

    if (!existingThread) {
      await ctx.db.insert("agentThreadRegistry", {
        userId,
        kind: "coach",
        threadId,
        title: "Coach",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    const saved = await coachAgent.saveMessage(ctx, {
      threadId,
      userId: String(userId),
      prompt: body,
      skipEmbeddings: true,
    });

    await ctx.scheduler.runAfter(0, internal.coach.processCoachAgentReply, {
      userId,
      threadId,
      promptMessageId: saved.messageId,
    });

    return {
      ok: true,
    };
  },
});

export const getCoachAgentContext = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const [user, runningSchedule, competitiveness, personality, activePlan] = await Promise.all([
      ctx.db.get(args.userId),
      ctx.db
        .query("runningSchedules")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", args.userId))
        .unique(),
      ctx.db
        .query("competitiveness")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", args.userId))
        .unique(),
      ctx.db
        .query("personalities")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", args.userId))
        .unique(),
      ctx.db
        .query("trainingPlans")
        .withIndex("by_user_id_status", (queryBuilder) =>
          queryBuilder.eq("userId", args.userId).eq("status", "active"),
        )
        .unique(),
    ]);
    const activeGoal = activePlan ? await ctx.db.get(activePlan.goalId) : null;

    return {
      planId: activePlan?._id,
      personalityDescription: personality?.description ?? "Brief, direct, no fluff.",
      competitiveness: competitiveness?.level ?? "balanced",
      supportMessage: buildCoachSupportMessage({
        personalityDescription: personality?.description ?? "Brief, direct, no fluff.",
        competitiveness: competitiveness?.level ?? "balanced",
        activePlan: activePlan
          ? {
              goalLabel: activeGoal?.label ?? "current plan",
              numberOfWeeks: activePlan.numberOfWeeks,
              volumeMode: activePlan.volumeMode,
              peakWeekVolume: activePlan.peakWeekVolume,
            }
          : null,
        runningSchedule: runningSchedule
          ? {
              preferredRunningDays: runningSchedule.preferredRunningDays,
              runningDaysPerWeek: runningSchedule.runningDaysPerWeek,
              preferredLongRunDay: runningSchedule.preferredLongRunDay,
            }
          : null,
        currentVDOT: user?.currentVDOT ?? undefined,
      }),
    };
  },
});

export const persistCoachAgentReply = internalMutation({
  args: {
    userId: v.id("users"),
    threadId: v.string(),
    body: v.string(),
    planId: v.optional(v.id("trainingPlans")),
  },
  handler: async (ctx, args) => {
    const registry = await ctx.db
      .query("agentThreadRegistry")
      .withIndex("by_thread_id", (queryBuilder) => queryBuilder.eq("threadId", args.threadId))
      .unique();

    await ctx.db.insert("coachMessages", {
      userId: args.userId,
      author: "coach",
      kind: "message",
      body: args.body,
      planId: args.planId,
      createdAt: Date.now(),
    });

    if (registry) {
      await ctx.db.patch(registry._id, {
        updatedAt: Date.now(),
      });
    }
  },
});

export const processCoachAgentReply = internalAction({
  args: {
    userId: v.id("users"),
    threadId: v.string(),
    promptMessageId: v.string(),
  },
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(internal.coach.getCoachAgentContext, {
      userId: args.userId,
    });
    if (!context) {
      return;
    }

    const { thread } = await coachAgent.continueThread(ctx, {
      threadId: args.threadId,
      userId: String(args.userId),
    });
    const result = await thread.generateText({
      promptMessageId: args.promptMessageId,
      system: `${buildCoachInstructions()} Personality voice guidance: ${context.personalityDescription}. Competitiveness: ${context.competitiveness}.`,
      messages: [{ role: "user", content: context.supportMessage }],
    });

    await ctx.runMutation(internal.coach.persistCoachAgentReply, {
      userId: args.userId,
      threadId: args.threadId,
      body: result.text,
      planId: context.planId ?? undefined,
    });
  },
});

export const retryWeekDetailGeneration = mutation({
  args: {
    requestId: v.id("aiRequests"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedMutationUserId(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request || request.userId !== userId || request.callType !== "weekDetailGeneration") {
      throw new Error("Week-detail request not found.");
    }

    if (request.status !== "failed") {
      throw new Error("Only failed week-detail requests can be retried manually.");
    }

    await ctx.db.patch(request._id, {
      status: "queued",
      errorCode: undefined,
      errorMessage: undefined,
      nextRetryAt: undefined,
      completedAt: undefined,
      updatedAt: Date.now(),
    });

    await startAiWorkflow(ctx, internal.coach.runWeekDetailGenerationWorkflow, {
      requestId: request._id,
    });

    return {
      requestId: request._id,
      status: "queued" as const,
    };
  },
});

export const retryPlanAssessment = mutation({
  args: {
    requestId: v.id("aiRequests"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedMutationUserId(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request || request.userId !== userId || request.callType !== "planAssessment") {
      throw new Error("Plan-assessment request not found.");
    }

    if (request.status === "inProgress") {
      return {
        requestId: request._id,
        status: request.status,
      };
    }

    await ctx.db.patch(request._id, {
      status: "queued",
      errorCode: undefined,
      errorMessage: undefined,
      nextRetryAt: undefined,
      completedAt: undefined,
      updatedAt: Date.now(),
    });

    await startAiWorkflow(ctx, internal.coach.runPlanAssessmentWorkflow, {
      requestId: request._id,
    });

    return {
      requestId: request._id,
      status: "queued" as const,
    };
  },
});

export const getWeekDetailGenerationContext = internalQuery({
  args: {
    requestId: v.id("aiRequests"),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request || request.callType !== "weekDetailGeneration") {
      return null;
    }

    const input = asWeekDetailInput(request.input);
    const plan = await ctx.db.get(input.planId);
    if (!plan || plan.status !== "active" || !plan.startDateKey || !plan.canonicalTimeZoneId) {
      return null;
    }

    const week = await ctx.db
      .query("trainingWeeks")
      .withIndex("by_plan_id_week_number", (queryBuilder) =>
        queryBuilder.eq("planId", plan._id).eq("weekNumber", input.weekNumber),
      )
      .unique();
    if (!week) {
      return null;
    }

    const [user, goal, competitiveness, runningSchedule, personality] = await Promise.all([
      ctx.db.get(request.userId),
      ctx.db.get(plan.goalId),
      ctx.db
        .query("competitiveness")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", request.userId))
        .unique(),
      ctx.db
        .query("runningSchedules")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", request.userId))
        .unique(),
      ctx.db
        .query("personalities")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", request.userId))
        .unique(),
    ]);
    if (!user || !goal) {
      return null;
    }

    const availabilityOverride = normalizeAvailabilityOverride(week.availabilityOverride);
    const [healthKitWorkouts, weekWorkouts, executionSummaryByPlannedWorkoutId, races] = await Promise.all([
      ctx.db
        .query("healthKitWorkouts")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", request.userId))
        .collect(),
      ctx.db
        .query("workouts")
        .withIndex("by_week_id", (queryBuilder) => queryBuilder.eq("weekId", week._id))
        .collect(),
      listExecutionSummariesByPlannedWorkoutId(ctx, request.userId),
      ctx.db
        .query("races")
        .withIndex("by_plan_id", (queryBuilder) => queryBuilder.eq("planId", plan._id))
        .collect(),
    ]);

    const recentWorkouts = healthKitWorkouts
      .sort((left, right) => right.startedAt - left.startedAt)
      .slice(0, 20)
      .map((workout) => ({
        startedAt: workout.startedAt,
        durationSeconds: workout.durationSeconds,
        distanceMeters: workout.distanceMeters,
        averageHeartRate: workout.averageHeartRate,
      }));

    const racesInWeek = races
      .filter((race) => {
        const raceDateKey = dateKeyFromEpochMs(race.plannedDate, plan.canonicalTimeZoneId ?? "UTC");
        return raceDateKey >= week.weekStartDateKey && raceDateKey <= week.weekEndDateKey;
      })
      .sort((left, right) => left.plannedDate - right.plannedDate)
      .map((race) => ({
        label: race.label,
        plannedDate: race.plannedDate,
        distanceMeters: race.distanceMeters,
        goalTimeSeconds: race.goalTimeSeconds,
        isPrimaryGoal: race.isPrimaryGoal,
      }));

    const lockedRunningWorkouts: WeekDetailWorkoutProposal[] = weekWorkouts
      .filter((workout) => executionSummaryByPlannedWorkoutId.get(String(workout._id))?.matchStatus === "matched")
      .sort((left, right) => left.scheduledDateKey.localeCompare(right.scheduledDateKey))
      .map((workout) => ({
        type: workout.type,
        volumePercent: workout.volumePercent,
        scheduledDate: workout.scheduledDateKey as `${number}-${string}-${string}`,
        venue: workout.venue,
        ...(workout.notes ? { notes: workout.notes } : {}),
        segments: workout.segments.map((segment) => ({
          label: segment.label,
          paceZone: segment.paceZone,
          targetValue: segment.targetValue,
          targetUnit: segment.targetUnit,
          ...(segment.repetitions ? { repetitions: segment.repetitions } : {}),
          ...(typeof segment.restValue === "number" && segment.restUnit
            ? { restValue: segment.restValue, restUnit: segment.restUnit }
            : {}),
        })),
      }));

    const preferredRunningDays = effectivePreferredRunningDays(runningSchedule, availabilityOverride);
    const volumeTargetMode = resolveWeekVolumeTargetMode({
      availabilityOverride,
      interruptionType: week.interruptionType,
      racesInWeekCount: racesInWeek.length,
    });

    return {
      request,
      input,
      plan,
      week,
      promptInput: {
        goalLabel: goal.label,
        volumeMode: plan.volumeMode,
        peakWeekVolume: plan.peakWeekVolume,
        currentVDOT: user.currentVDOT,
        competitiveness: competitiveness?.level ?? "balanced",
        personalityDescription: personality?.description ?? "Direct and concise coaching.",
        preferredRunningDays,
        preferredLongRunDay: runningSchedule?.preferredLongRunDay ?? undefined,
        preferredQualityDays: runningSchedule?.preferredQualityDays ?? [],
        trackAccess: user.trackAccess,
        weekNumber: week.weekNumber,
        weekStartDateKey: week.weekStartDateKey as `${number}-${string}-${string}`,
        weekEndDateKey: week.weekEndDateKey as `${number}-${string}-${string}`,
        targetVolumePercent: week.targetVolumePercent,
        targetVolumeAbsolute: week.targetVolumeAbsolute,
        emphasis: week.emphasis,
        recentWorkouts,
        ...(availabilityOverride ? { availabilityOverride } : {}),
        ...(week.interruptionType
          ? {
              interruption: {
                type: week.interruptionType,
                ...(week.interruptionNote ? { note: week.interruptionNote } : {}),
              },
            }
          : {}),
        races: racesInWeek,
        includeStrength: plan.includeStrength ?? false,
        strengthEquipment: plan.strengthEquipment ?? [],
        strengthApproach: plan.strengthApproach,
        lockedRunningWorkouts,
        volumeTargetMode,
      },
    };
  },
});

export const getPlanAssessmentContext = internalQuery({
  args: {
    requestId: v.id("aiRequests"),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request || request.callType !== "planAssessment") {
      return null;
    }

    const input = asPlanAssessmentInput(request.input);
    const plan = await ctx.db.get(input.planId);
    if (!plan || (plan.status !== "completed" && plan.status !== "abandoned")) {
      return null;
    }

    const [user, goal, competitiveness, personality, weeks, workouts, executions, peakVolumeChanges, goalChanges, races] =
      await Promise.all([
        ctx.db.get(request.userId),
        ctx.db.get(plan.goalId),
        ctx.db
          .query("competitiveness")
          .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", request.userId))
          .unique(),
        ctx.db
          .query("personalities")
          .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", request.userId))
          .unique(),
        ctx.db
          .query("trainingWeeks")
          .withIndex("by_plan_id", (queryBuilder) => queryBuilder.eq("planId", plan._id))
          .collect(),
        ctx.db
          .query("workouts")
          .withIndex("by_plan_id_scheduled_date_key", (queryBuilder) =>
            queryBuilder.eq("planId", plan._id),
          )
          .collect(),
        ctx.db
          .query("workoutExecutions")
          .withIndex("by_plan_id", (queryBuilder) => queryBuilder.eq("planId", plan._id))
          .collect(),
        ctx.db
          .query("peakVolumeChanges")
          .withIndex("by_plan_id", (queryBuilder) => queryBuilder.eq("planId", plan._id))
          .collect(),
        ctx.db
          .query("goalChanges")
          .withIndex("by_plan_id", (queryBuilder) => queryBuilder.eq("planId", plan._id))
          .collect(),
        ctx.db
          .query("races")
          .withIndex("by_plan_id", (queryBuilder) => queryBuilder.eq("planId", plan._id))
          .collect(),
      ]);

    if (!user || !goal) {
      return null;
    }

    const weeksByNumber = [...weeks].sort((left, right) => left.weekNumber - right.weekNumber);
    const derivedCompletedWeek =
      plan.startDateKey ? deriveCurrentWeekNumber(plan, plan.updatedAt) ?? plan.numberOfWeeks : plan.numberOfWeeks;
    const completedWeekCount = Math.min(plan.numberOfWeeks, Math.max(1, derivedCompletedWeek));
    const includedWeeks = weeksByNumber.filter((week) => week.weekNumber <= completedWeekCount);
    const targetWeekIds = new Set(includedWeeks.map((week) => String(week._id)));
    const workoutsInIncludedWeeks = workouts.filter((workout) => targetWeekIds.has(String(workout.weekId)));

    const executionsWithHealthKit = await Promise.all(
      executions.map(async (execution) => ({
        execution,
        healthKitWorkout: await ctx.db.get(execution.healthKitWorkoutId),
      })),
    );

    const executionByPlannedWorkoutId = new Map(
      executionsWithHealthKit
        .filter((entry) => entry.execution.plannedWorkoutId)
        .map((entry) => [String(entry.execution.plannedWorkoutId), entry] as const),
    );
    const workoutsByWeekId = new Map<string, typeof workoutsInIncludedWeeks>();
    for (const workout of workoutsInIncludedWeeks) {
      const bucket = workoutsByWeekId.get(String(workout.weekId)) ?? [];
      bucket.push(workout);
      workoutsByWeekId.set(String(workout.weekId), bucket);
    }

    const raceWeekNumbers = new Set(
      races
        .map((race) => {
          const week = includedWeeks.find((candidate) => {
            const raceDateKey = dateKeyFromEpochMs(race.plannedDate, plan.canonicalTimeZoneId ?? "UTC");
            return raceDateKey >= candidate.weekStartDateKey && raceDateKey <= candidate.weekEndDateKey;
          });
          return week?.weekNumber;
        })
        .filter((weekNumber): weekNumber is number => typeof weekNumber === "number"),
    );

    const peakWeek = [...includedWeeks].sort((left, right) => right.targetVolumeAbsolute - left.targetVolumeAbsolute)[0] ?? null;
    const detailWeekNumbers = new Set<number>();
    if (includedWeeks[0]) {
      detailWeekNumbers.add(includedWeeks[0].weekNumber);
    }
    if (peakWeek) {
      detailWeekNumbers.add(peakWeek.weekNumber);
    }
    for (const weekNumber of raceWeekNumbers) {
      detailWeekNumbers.add(weekNumber);
    }
    for (const week of includedWeeks.slice(-2)) {
      detailWeekNumbers.add(week.weekNumber);
    }

    const goalLabelById = new Map<string, string>();
    goalLabelById.set(String(goal._id), goal.label);
    const missingGoalIds = Array.from(
      new Set(
        goalChanges.flatMap((change) => [String(change.previousGoalId), String(change.newGoalId)]).filter(
          (goalId) => !goalLabelById.has(goalId),
        ),
      ),
    );
    const missingGoalDocs = await Promise.all(missingGoalIds.map((goalId) => ctx.db.get(goalId as Id<"goals">)));
    for (const goalDoc of missingGoalDocs) {
      if (goalDoc) {
        goalLabelById.set(String(goalDoc._id), goalDoc.label);
      }
    }

    return {
      request,
      input,
      plan,
      promptInput: {
        goalLabel: goal.label,
        planStatus: plan.status,
        completionStyle:
          plan.status === "completed" && completedWeekCount >= plan.numberOfWeeks ? ("full" as const) : ("partial" as const),
        volumeMode: plan.volumeMode,
        peakWeekVolume: plan.peakWeekVolume,
        competitiveness: competitiveness?.level ?? "balanced",
        personalityDescription: personality?.description ?? "Direct and concise coaching.",
        currentVDOT: user.currentVDOT ?? undefined,
        weeks: includedWeeks.map((week) => {
          const weekWorkouts = workoutsByWeekId.get(String(week._id)) ?? [];
          const matchedExecutions = weekWorkouts
            .map((workout) => executionByPlannedWorkoutId.get(String(workout._id)))
            .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
            .filter((entry) => entry.execution.matchStatus === "matched");

          const actualCompletedVolume = matchedExecutions.reduce((sum, entry) => {
            if (plan.volumeMode === "time") {
              return sum + (entry.healthKitWorkout?.durationSeconds ?? 0);
            }
            return sum + (entry.healthKitWorkout?.distanceMeters ?? 0);
          }, 0);
          const rpeValues = matchedExecutions
            .map((entry) => entry.execution.rpe)
            .filter((value): value is number => typeof value === "number");

          return {
            weekNumber: week.weekNumber,
            emphasis: week.emphasis,
            targetVolumeAbsolute: week.targetVolumeAbsolute,
            plannedWorkoutCount: weekWorkouts.length,
            completedWorkoutCount: matchedExecutions.length,
            actualCompletedVolume,
            ...(rpeValues.length > 0
              ? {
                  averageRpe:
                    Math.round((rpeValues.reduce((sum, value) => sum + value, 0) / rpeValues.length) * 10) / 10,
                }
              : {}),
            ...(week.interruptionType ? { interruptionType: week.interruptionType } : {}),
          };
        }),
        detailWeeks: includedWeeks
          .filter((week) => detailWeekNumbers.has(week.weekNumber))
          .map((week) => ({
            weekNumber: week.weekNumber,
            emphasis: week.emphasis,
            workouts: (workoutsByWeekId.get(String(week._id)) ?? [])
              .sort((left, right) => left.scheduledDateKey.localeCompare(right.scheduledDateKey))
              .map((workout) => {
                const executionEntry = executionByPlannedWorkoutId.get(String(workout._id)) ?? null;
                return {
                  type: workout.type,
                  scheduledDateKey: workout.scheduledDateKey,
                  status: executionEntry?.execution.matchStatus === "matched" ? "completed" : workout.status,
                  absoluteVolume: workout.absoluteVolume,
                  executed: executionEntry?.execution.matchStatus === "matched",
                  ...(typeof executionEntry?.execution.rpe === "number" ? { rpe: executionEntry.execution.rpe } : {}),
                  ...(typeof executionEntry?.healthKitWorkout?.durationSeconds === "number"
                    ? { actualDurationSeconds: executionEntry.healthKitWorkout.durationSeconds }
                    : {}),
                  ...(typeof executionEntry?.healthKitWorkout?.distanceMeters === "number"
                    ? { actualDistanceMeters: executionEntry.healthKitWorkout.distanceMeters }
                    : {}),
                };
              }),
          })),
        peakVolumeChanges: peakVolumeChanges
          .sort((left, right) => left.createdAt - right.createdAt)
          .map((change) => ({
            previousPeakWeekVolume: change.previousPeakWeekVolume,
            newPeakWeekVolume: change.newPeakWeekVolume,
            reason: change.reason,
            createdAt: change.createdAt,
          })),
        goalChanges: goalChanges
          .sort((left, right) => left.createdAt - right.createdAt)
          .map((change) => ({
            previousGoalLabel: goalLabelById.get(String(change.previousGoalId)) ?? "Previous goal",
            newGoalLabel: goalLabelById.get(String(change.newGoalId)) ?? "Updated goal",
            reason: change.reason,
            createdAt: change.createdAt,
          })),
        races: races
          .sort((left, right) => left.plannedDate - right.plannedDate)
          .map((race) => ({
            label: race.label,
            plannedDate: race.plannedDate,
            distanceMeters: race.distanceMeters,
            goalTimeSeconds: race.goalTimeSeconds,
            actualTimeSeconds: race.actualTimeSeconds,
            isPrimaryGoal: race.isPrimaryGoal,
          })),
      },
    };
  },
});

export const generateWeekDetailArtifacts: ReturnType<typeof internalAction> = internalAction({
  args: {
    requestId: v.id("aiRequests"),
  },
  handler: async (ctx, args): Promise<{
    proposal: unknown;
    metadata: {
      agent: string;
      messageId: string;
    };
  }> => {
    const context = await ctx.runQuery(internal.coach.getWeekDetailGenerationContext, {
      requestId: args.requestId,
    });
    if (!context) {
      throw new Error("Could not load week-detail generation context.");
    }

    if (!isWeekGeneratable(context.plan, context.week.weekNumber, Date.now())) {
      throw new Error("Only the current week and next week can be generated.");
    }

    const messages = buildWeekDetailGenerationMessages(context.promptInput);
    const [systemMessage, ...conversationMessages] = messages;
    const { thread } = await weekBuilderAgent.createThread(ctx, {
      userId: String(context.request.userId),
      title: `Week ${context.week.weekNumber}: ${context.promptInput.goalLabel}`,
    });
    const result = await thread.generateText(
      {
        system: String(systemMessage?.content ?? ""),
        messages: conversationMessages.map((message) => ({
          role: message.role,
          content: String(message.content),
        })),
      },
      {
        storageOptions: {
          saveMessages: "promptAndOutput",
        },
      },
    );

    return {
      proposal: parseJsonPayloadFromModel(result.text),
      metadata: {
        agent: "weekBuilderAgent",
        messageId: result.messageId,
      },
    };
  },
});

export const generatePlanAssessmentArtifacts: ReturnType<typeof internalAction> = internalAction({
  args: {
    requestId: v.id("aiRequests"),
  },
  handler: async (ctx, args): Promise<{
    proposal: unknown;
    metadata: {
      agent: string;
      messageId: string;
    };
  }> => {
    const context = await ctx.runQuery(internal.coach.getPlanAssessmentContext, {
      requestId: args.requestId,
    });
    if (!context) {
      throw new Error("Could not load plan-assessment context.");
    }

    const messages = buildPlanAssessmentMessages(context.promptInput);
    const [systemMessage, ...conversationMessages] = messages;
    const { thread } = await assessmentAgent.createThread(ctx, {
      userId: String(context.request.userId),
      title: `Assessment: ${context.promptInput.goalLabel}`,
    });
    const result = await thread.generateText(
      {
        system: `${buildAssessmentInstructions()} ${String(systemMessage?.content ?? "")}`,
        messages: conversationMessages.map((message) => ({
          role: message.role,
          content: String(message.content),
        })),
      },
      {
        storageOptions: {
          saveMessages: "promptAndOutput",
        },
      },
    );

    return {
      proposal: parseJsonPayloadFromModel(result.text),
      metadata: {
        agent: "assessmentAgent",
        messageId: result.messageId,
      },
    };
  },
});

export const markRequestInProgress = internalMutation({
  args: {
    requestId: v.id("aiRequests"),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request || request.status !== "queued") {
      return null;
    }

    const now = Date.now();
    const nextAttemptCount = request.attemptCount + 1;

    await ctx.db.patch(request._id, {
      status: "inProgress",
      attemptCount: nextAttemptCount,
      lastAttemptAt: now,
      updatedAt: now,
      nextRetryAt: undefined,
    });

    return {
      userId: request.userId,
      attemptCount: nextAttemptCount,
      maxAttempts: request.maxAttempts,
    };
  },
});

export const finalizeWeekDetailGenerationSuccess = internalMutation({
  args: {
    requestId: v.id("aiRequests"),
    proposal: v.any(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) {
      return null;
    }

    if (request.callType !== "weekDetailGeneration") {
      throw new Error("finalizeWeekDetailGenerationSuccess only supports weekDetailGeneration requests.");
    }

    const input = asWeekDetailInput(request.input);
    const plan = await ctx.db.get(input.planId);
    if (!plan) {
      throw new Error("Active plan for week detail could not be loaded.");
    }

    const week = await ctx.db
      .query("trainingWeeks")
      .withIndex("by_plan_id_week_number", (queryBuilder) =>
        queryBuilder.eq("planId", plan._id).eq("weekNumber", input.weekNumber),
      )
      .unique();
    if (!week) {
      throw new Error("Target training week could not be loaded.");
    }

    const [runningSchedule, existingWorkouts, executionSummaryByPlannedWorkoutId, racesInPlan, existingStrengthWorkouts, user] =
      await Promise.all([
        ctx.db
          .query("runningSchedules")
          .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", request.userId))
          .unique(),
        ctx.db
          .query("workouts")
          .withIndex("by_week_id", (queryBuilder) => queryBuilder.eq("weekId", week._id))
          .collect(),
        listExecutionSummariesByPlannedWorkoutId(ctx, request.userId),
        ctx.db
          .query("races")
          .withIndex("by_plan_id", (queryBuilder) => queryBuilder.eq("planId", plan._id))
          .collect(),
        ctx.db
          .query("strengthWorkouts")
          .withIndex("by_week_id", (queryBuilder) => queryBuilder.eq("weekId", week._id))
          .collect(),
        ctx.db.get(request.userId),
      ]);

    const availabilityOverride = normalizeAvailabilityOverride(week.availabilityOverride);
    const lockedWorkouts: WeekDetailWorkoutProposal[] = existingWorkouts
      .filter((workout) => executionSummaryByPlannedWorkoutId.get(String(workout._id))?.matchStatus === "matched")
      .map((workout) => ({
        type: workout.type,
        volumePercent: workout.volumePercent,
        scheduledDate: workout.scheduledDateKey as `${number}-${string}-${string}`,
        venue: workout.venue,
        ...(workout.notes ? { notes: workout.notes } : {}),
        segments: workout.segments.map((segment) => ({
          label: segment.label,
          paceZone: segment.paceZone,
          targetValue: segment.targetValue,
          targetUnit: segment.targetUnit,
          ...(segment.repetitions ? { repetitions: segment.repetitions } : {}),
          ...(typeof segment.restValue === "number" && segment.restUnit
            ? { restValue: segment.restValue, restUnit: segment.restUnit }
            : {}),
        })),
      }));
    const racesInWeek = racesInPlan.filter((race) => {
      const raceDateKey = dateKeyFromEpochMs(race.plannedDate, plan.canonicalTimeZoneId ?? "UTC");
      return raceDateKey >= week.weekStartDateKey && raceDateKey <= week.weekEndDateKey;
    });

    const validated = validateWeekDetailResponse(args.proposal, {
      weekStartDateKey: week.weekStartDateKey as `${number}-${string}-${string}`,
      weekEndDateKey: week.weekEndDateKey as `${number}-${string}-${string}`,
      targetVolumePercent: week.targetVolumePercent,
      preferredRunningDays: effectivePreferredRunningDays(runningSchedule, availabilityOverride),
      trackAccess: Boolean(user?.trackAccess),
      lockedWorkouts,
      volumeTargetMode: resolveWeekVolumeTargetMode({
        availabilityOverride,
        interruptionType: week.interruptionType,
        racesInWeekCount: racesInWeek.length,
      }),
    });

    const metadata = asMetadata(args.metadata);
    const result = {
      ...validated.proposal,
      ...(metadata ? { metadata } : {}),
      corrections: validated.corrections,
    };

    for (const workout of existingWorkouts) {
      if (executionSummaryByPlannedWorkoutId.get(String(workout._id))?.matchStatus === "matched") {
        continue;
      }
      await ctx.db.delete(workout._id);
    }

    const now = Date.now();
    for (const workout of validated.proposal.workouts) {
      await ctx.db.insert("workouts", {
        planId: plan._id,
        weekId: week._id,
        type: workout.type,
        volumePercent: workout.volumePercent,
        absoluteVolume: resolveAbsoluteWeekVolume(plan.volumeMode, plan.peakWeekVolume, workout.volumePercent),
        scheduledDateKey: workout.scheduledDate,
        notes: workout.notes,
        venue: workout.venue,
        origin: "planned",
        status: "planned",
        segments: workout.segments.map((segment, index) => ({
          ...segment,
          order: index + 1,
        })),
        createdAt: now,
        updatedAt: now,
      });
    }

    const preservedStrengthStatusByTitle = new Map(
      existingStrengthWorkouts.map((workout) => [workout.title, workout.status] as const),
    );
    for (const workout of existingStrengthWorkouts) {
      await ctx.db.delete(workout._id);
    }

    for (const workout of validated.proposal.strengthWorkouts ?? []) {
      await ctx.db.insert("strengthWorkouts", {
        userId: request.userId,
        planId: plan._id,
        weekId: week._id,
        title: workout.title,
        plannedMinutes: workout.plannedMinutes,
        notes: workout.notes,
        exercises: workout.exercises,
        status: preservedStrengthStatusByTitle.get(workout.title) ?? "planned",
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(week._id, {
      coachNotes: validated.proposal.coachNotes,
      vdotAtGeneration: user?.currentVDOT ?? undefined,
      generated: true,
      generatedByAiRequestId: request._id,
      updatedAt: now,
    });

    await ctx.db.patch(request._id, {
      status: "succeeded",
      result,
      errorCode: undefined,
      errorMessage: undefined,
      nextRetryAt: undefined,
      completedAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("coachMessages", {
      userId: request.userId,
      author: "coach",
      kind: "event",
      body: `Week ${week.weekNumber} workouts are ready.`,
      planId: plan._id,
      relatedRequestId: request._id,
      createdAt: now,
    });

    return {
      corrections: validated.corrections,
    };
  },
});

export const finalizePlanAssessmentSuccess = internalMutation({
  args: {
    requestId: v.id("aiRequests"),
    proposal: v.any(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) {
      return null;
    }

    if (request.callType !== "planAssessment") {
      throw new Error("finalizePlanAssessmentSuccess only supports planAssessment requests.");
    }

    const input = asPlanAssessmentInput(request.input);
    const plan = await ctx.db.get(input.planId);
    if (!plan) {
      throw new Error("Plan for assessment could not be loaded.");
    }

    const validated = validatePlanAssessmentResponse(args.proposal);
    const metadata = asMetadata(args.metadata);
    const result = {
      ...validated.proposal,
      ...(metadata ? { metadata } : {}),
      corrections: validated.corrections,
    };

    const now = Date.now();
    const existingAssessments = await ctx.db
      .query("planAssessments")
      .withIndex("by_plan_id", (queryBuilder) => queryBuilder.eq("planId", plan._id))
      .collect();
    const sortedAssessments = [...existingAssessments].sort((left, right) => right.createdAt - left.createdAt);

    if (sortedAssessments[0]) {
      await ctx.db.patch(sortedAssessments[0]._id, {
        ...validated.proposal,
        updatedAt: now,
      });
      for (const stale of sortedAssessments.slice(1)) {
        await ctx.db.delete(stale._id);
      }
    } else {
      await ctx.db.insert("planAssessments", {
        userId: request.userId,
        planId: plan._id,
        ...validated.proposal,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(request._id, {
      status: "succeeded",
      result,
      errorCode: undefined,
      errorMessage: undefined,
      nextRetryAt: undefined,
      completedAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("coachMessages", {
      userId: request.userId,
      author: "coach",
      kind: "event",
      body: `Assessment ready for ${plan.status === "abandoned" ? "the closed block" : "the completed block"}.`,
      planId: plan._id,
      relatedRequestId: request._id,
      createdAt: now,
    });

    return {
      corrections: validated.corrections,
    };
  },
});

export const markRequestFailed = internalMutation({
  args: {
    requestId: v.id("aiRequests"),
    errorCode: v.string(),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) {
      return;
    }

    const now = Date.now();
    await ctx.db.patch(request._id, {
      status: "failed",
      errorCode: args.errorCode,
      errorMessage: args.errorMessage,
      nextRetryAt: undefined,
      completedAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("coachMessages", {
      userId: request.userId,
      author: "coach",
      kind: "event",
      body:
        request.callType === "weekDetailGeneration"
          ? `Week detail generation failed: ${args.errorMessage}`
          : request.callType === "planAssessment"
            ? `Plan assessment failed: ${args.errorMessage}`
            : `Plan generation failed: ${args.errorMessage}`,
      relatedRequestId: request._id,
      createdAt: now,
    });
  },
});

export const appendDiagnostic = internalMutation({
  args: {
    requestId: v.id("aiRequests"),
    code: v.string(),
    message: v.string(),
    details: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) {
      return;
    }

    await ctx.db.insert("aiDiagnostics", {
      userId: request.userId,
      requestId: request._id,
      callType: request.callType,
      code: args.code,
      message: args.message,
      details: args.details,
      createdAt: Date.now(),
    });
  },
});

export const runWeekDetailGenerationWorkflow = workflow.define({
  args: {
    requestId: v.id("aiRequests"),
  },
  handler: async (step, args) => {
    const started = await step.runMutation(internal.coach.markRequestInProgress, {
      requestId: args.requestId,
    });
    if (!started) {
      return;
    }

    try {
      const generated = await step.runAction(internal.coach.generateWeekDetailArtifacts, {
        requestId: args.requestId,
      });
      const finalized = await step.runMutation(internal.coach.finalizeWeekDetailGenerationSuccess, {
        requestId: args.requestId,
        proposal: generated.proposal,
        metadata: generated.metadata,
      });

      if (finalized && finalized.corrections.length > 0) {
        await step.runMutation(internal.coach.appendDiagnostic, {
          requestId: args.requestId,
          code: "WEEK_DETAIL_AUTO_CORRECTED",
          message: "Applied deterministic corrections to AI week-detail proposal.",
          details: {
            corrections: finalized.corrections,
          },
        });
      }
    } catch (error) {
      const message = describeAiError(error);
      await step.runMutation(internal.coach.appendDiagnostic, {
        requestId: args.requestId,
        code: "WEEK_DETAIL_GENERATION_FAILED",
        message,
      });

      await step.runMutation(internal.coach.markRequestFailed, {
        requestId: args.requestId,
        errorCode: "WEEK_DETAIL_GENERATION_FAILED",
        errorMessage: message,
      });
    }
  },
});

export const runPlanAssessmentWorkflow = workflow.define({
  args: {
    requestId: v.id("aiRequests"),
  },
  handler: async (step, args) => {
    const started = await step.runMutation(internal.coach.markRequestInProgress, {
      requestId: args.requestId,
    });
    if (!started) {
      return;
    }

    try {
      const generated = await step.runAction(internal.coach.generatePlanAssessmentArtifacts, {
        requestId: args.requestId,
      }, {
        retry: true,
      });
      const finalized = await step.runMutation(internal.coach.finalizePlanAssessmentSuccess, {
        requestId: args.requestId,
        proposal: generated.proposal,
        metadata: generated.metadata,
      });

      if (finalized && finalized.corrections.length > 0) {
        await step.runMutation(internal.coach.appendDiagnostic, {
          requestId: args.requestId,
          code: "PLAN_ASSESSMENT_AUTO_CORRECTED",
          message: "Applied deterministic corrections to AI plan assessment.",
          details: {
            corrections: finalized.corrections,
          },
        });
      }
    } catch (error) {
      const message = describeAiError(error);
      await step.runMutation(internal.coach.appendDiagnostic, {
        requestId: args.requestId,
        code: "PLAN_ASSESSMENT_FAILED",
        message,
      });

      await step.runMutation(internal.coach.markRequestFailed, {
        requestId: args.requestId,
        errorCode: "PLAN_ASSESSMENT_FAILED",
        errorMessage: message,
      });
    }
  },
});
