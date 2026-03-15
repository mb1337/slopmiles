import { getAuthUserId } from "@convex-dev/auth/server";
import { listUIMessages } from "@convex-dev/agent";
import { WorkflowManager } from "@convex-dev/workflow";
import { v } from "convex/values";

import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { planBuilderAgent, weekBuilderAgent } from "./agentRuntime";
import { validatePlanGenerationResponse, type PlanGenerationProposal } from "./coachContracts";
import { validateWeekDetailResponse, type WeekDetailWorkoutProposal } from "./weekDetailContracts";
import {
  goalTypes,
  strengthEquipmentOptions,
  weekdays,
  volumeModes,
  workoutTypes,
  workoutVenues,
  type StrengthEquipment,
} from "./constants";
import { dateKeyFromEpochMs, type DateKey } from "../packages/domain/src/calendar";
import { deriveCurrentWeekNumber, normalizeActivationDateKey, resolveAbsoluteWeekVolume } from "./planWeeks";
import { enqueueWeekDetailGeneration, seedTrainingWeeks } from "./plans";
import { listExecutionSummariesByPlannedWorkoutId } from "./workoutExecutionHelpers";

const workflow = new WorkflowManager(components.workflow);
const STALE_PENDING_DRAFT_MS = 15_000;
const goalTypeValidator = v.union(...goalTypes.map((goalType) => v.literal(goalType)));
const volumeModeValidator = v.union(...volumeModes.map((mode) => v.literal(mode)));
const strengthEquipmentValidator = v.union(...strengthEquipmentOptions.map((item) => v.literal(item)));
const weekdayValidator = v.union(...weekdays.map((day) => v.literal(day)));

export type PlanDraftContext = {
  draft: Doc<"agentPlanDrafts">;
  promptPayload: string;
  personalityDescription: string;
  competitiveness: string;
  currentDraftObject: unknown;
};

export type WeekDraftContext = {
  draft: Doc<"agentWeekDrafts">;
  promptPayload: string;
  personalityDescription: string;
  currentDraftObject: unknown;
};

function trimNonEmpty(value: string, label = "value"): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} cannot be empty.`);
  }
  return trimmed;
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

export function normalizeAvailabilityOverride(
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
    ...(candidate.availabilityWindows &&
    typeof candidate.availabilityWindows === "object" &&
    !Array.isArray(candidate.availabilityWindows)
      ? {
          availabilityWindows: candidate.availabilityWindows as Record<
            string,
            Array<{ start: string; end: string }>
          >,
        }
      : {}),
    ...(typeof candidate.note === "string" && candidate.note.trim().length > 0
      ? { note: candidate.note.trim() }
      : {}),
  };
}

export function effectivePreferredRunningDays(
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
  const overrideDays = availabilityOverride?.preferredRunningDays ?? [];
  if (overrideDays.length > 0) {
    return overrideDays;
  }
  if ((runningSchedule?.preferredRunningDays ?? []).length > 0) {
    return runningSchedule!.preferredRunningDays;
  }
  return [...weekdays];
}

export function resolveWeekVolumeTargetMode(args: {
  availabilityOverride: ReturnType<typeof normalizeAvailabilityOverride>;
  interruptionType?: string;
  racesInWeekCount: number;
}): "exact" | "upToTarget" {
  if (args.availabilityOverride || args.interruptionType || args.racesInWeekCount > 0) {
    return "upToTarget";
  }
  return "exact";
}

function buildPlanSeedPrompt(args: {
  goalType: (typeof goalTypes)[number];
  goalLabel: string;
  targetDate?: number;
  goalTimeSeconds?: number;
  volumeMode: (typeof volumeModes)[number];
  requestedNumberOfWeeks?: number;
  includeStrength: boolean;
  strengthEquipment: StrengthEquipment[];
}): string {
  return [
    `Let's build a ${args.goalType === "race" ? "race" : "non-race"} plan.`,
    `Goal: ${args.goalLabel}.`,
    typeof args.targetDate === "number"
      ? `Target date: ${new Date(args.targetDate).toISOString().slice(0, 10)}.`
      : "No target date yet.",
    typeof args.goalTimeSeconds === "number"
      ? `Goal time: ${args.goalTimeSeconds} seconds.`
      : "Coach should choose goal time if needed.",
    `Use ${args.volumeMode} as the primary planning unit.`,
    typeof args.requestedNumberOfWeeks === "number"
      ? `Requested duration: ${Math.round(args.requestedNumberOfWeeks)} weeks.`
      : "Coach should determine the duration.",
    args.includeStrength
      ? `Include strength using: ${args.strengthEquipment.join(", ") || "coach-selected equipment"}.`
      : "Do not include strength work.",
    "Start with a realistic draft, then explain the main tradeoffs and what to change if I want it adjusted.",
  ].join(" ");
}

function buildWeekSeedPrompt(args: {
  goalLabel: string;
  weekNumber: number;
  emphasis: string;
  note?: string;
}): string {
  return [
    `Let's build week ${args.weekNumber} for ${args.goalLabel}.`,
    `Week emphasis: ${args.emphasis}.`,
    args.note ? `Special note: ${args.note}` : "Start from the existing week context.",
    "Generate a realistic week first, then explain the key scheduling and load decisions conversationally.",
  ].join(" ");
}

async function mapThreadMessages(ctx: QueryCtx, threadId: string) {
  const result = await listUIMessages(ctx, components.agent, {
    threadId,
    paginationOpts: {
      cursor: null,
      numItems: 60,
    },
  });

  return [...result.page].reverse().map((message) => ({
    _id: String(message.id),
    author: message.role,
    body: message.text,
    createdAt: message._creationTime,
    status: message.status,
  }));
}

async function loadLatestPlanDraft(ctx: QueryCtx, userId: Id<"users">) {
  const drafts = await ctx.db
    .query("agentPlanDrafts")
    .withIndex("by_user_id_updated_at", (queryBuilder) => queryBuilder.eq("userId", userId))
    .order("desc")
    .take(1);
  return drafts[0] ?? null;
}

function resolveDraftPresentationState(
  validationStatus: "pending" | "valid" | "invalid",
  latestError: string | undefined,
  updatedAt: number,
) {
  const isStalePending =
    validationStatus === "pending" && Date.now() - updatedAt > STALE_PENDING_DRAFT_MS;

  return {
    validationStatus: isStalePending ? ("invalid" as const) : validationStatus,
    latestError:
      latestError ??
      (isStalePending
        ? "Structured draft generation stalled. Send another message to retry."
        : null),
  };
}

async function loadWeekDraft(ctx: QueryCtx, userId: Id<"users">, planId: Id<"trainingPlans">, weekNumber: number) {
  return await ctx.db
    .query("agentWeekDrafts")
    .withIndex("by_plan_id_week_number", (queryBuilder) =>
      queryBuilder.eq("planId", planId).eq("weekNumber", Math.round(weekNumber)),
    )
    .unique();
}

async function materializeDraftPlanFromAgentDraft(
  ctx: MutationCtx,
  draft: Doc<"agentPlanDrafts">,
  proposal: PlanGenerationProposal,
  canonicalTimeZoneId: string,
): Promise<{ planId: Id<"trainingPlans">; currentWeekNumber: number | null }> {
  if (draft.consumedByPlanId) {
    const existingPlan = await ctx.db.get(draft.consumedByPlanId);
    if (existingPlan) {
      return {
        planId: existingPlan._id,
        currentWeekNumber: deriveCurrentWeekNumber(existingPlan, Date.now()),
      };
    }
  }

  const activePlan = await ctx.db
    .query("trainingPlans")
    .withIndex("by_user_id_status", (queryBuilder) =>
      queryBuilder.eq("userId", draft.userId).eq("status", "active"),
    )
    .unique();
  if (activePlan) {
    throw new Error("Complete or abandon the current active plan before starting a new one.");
  }

  const now = Date.now();
  const startDateKey = normalizeActivationDateKey(now, canonicalTimeZoneId);
  const goalId = await ctx.db.insert("goals", {
    userId: draft.userId,
    type: draft.goalType,
    label: draft.goalLabel,
    targetDate: draft.targetDate,
    goalTimeSeconds: draft.goalTimeSeconds,
    createdAt: now,
  });

  const planId = await ctx.db.insert("trainingPlans", {
    userId: draft.userId,
    goalId,
    startDateKey,
    canonicalTimeZoneId,
    activatedAt: now,
    numberOfWeeks: proposal.numberOfWeeks,
    volumeMode: draft.volumeMode,
    peakWeekVolume: proposal.peakWeekVolume,
    weeklyVolumeProfile: proposal.weeklyVolumeProfile,
    weeklyEmphasis: proposal.weeklyEmphasis,
    generationRationale: proposal.rationale,
    includeStrength: draft.includeStrength,
    strengthEquipment: draft.strengthEquipment,
    strengthApproach: proposal.strengthApproach,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });

  const plan = await ctx.db.get(planId);
  if (!plan) {
    throw new Error("Activated plan could not be reloaded.");
  }

  await seedTrainingWeeks(ctx, plan);
  const currentWeekNumber = deriveCurrentWeekNumber(plan, now);
  if (currentWeekNumber) {
    await enqueueWeekDetailGeneration(ctx, {
      userId: draft.userId,
      planId,
      weekNumber: currentWeekNumber,
    });
  }

  await ctx.db.insert("coachMessages", {
    userId: draft.userId,
    author: "coach",
    kind: "event",
    body: `Plan activated for ${draft.goalLabel}. I'll treat this as the live training focus now.`,
    planId,
    createdAt: now,
  });

  return {
    planId,
    currentWeekNumber,
  };
}

export function buildPlanConversationSupportMessage(args: {
  promptPayload: string;
  currentDraftObject: unknown;
}): string {
  return [
    "Structured plan context:",
    args.promptPayload,
    "Current structured draft JSON:",
    JSON.stringify(args.currentDraftObject ?? null),
    "Use this context to answer conversationally and keep the next draft coherent.",
  ].join("\n\n");
}

export function buildWeekConversationSupportMessage(args: {
  promptPayload: string;
  currentDraftObject: unknown;
}): string {
  return [
    "Structured week context:",
    args.promptPayload,
    "Current structured week draft JSON:",
    JSON.stringify(args.currentDraftObject ?? null),
    "Use this context to explain week changes clearly and keep the next draft coherent.",
  ].join("\n\n");
}

export const getPlanBuilderView = query({
  args: {
    draftId: v.optional(v.id("agentPlanDrafts")),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedQueryUserId(ctx);
    const draft =
      args.draftId && (await ctx.db.get(args.draftId))?.userId === userId
        ? await ctx.db.get(args.draftId)
        : await loadLatestPlanDraft(ctx, userId);

    const activePlan = await ctx.db
      .query("trainingPlans")
      .withIndex("by_user_id_status", (queryBuilder) =>
        queryBuilder.eq("userId", userId).eq("status", "active"),
      )
      .unique();
    const activeGoal = activePlan ? await ctx.db.get(activePlan.goalId) : null;

    if (!draft) {
      return {
        draft: null,
        messages: [],
        activePlan: activePlan
          ? {
              _id: String(activePlan._id),
              goalLabel: activeGoal?.label ?? "Current plan",
            }
          : null,
      };
    }

    const presentation = resolveDraftPresentationState(
      draft.validationStatus,
      draft.latestError,
      draft.updatedAt,
    );

    return {
      draft: {
        _id: String(draft._id),
        threadId: draft.threadId,
        goalType: draft.goalType,
        goalLabel: draft.goalLabel,
        targetDate: draft.targetDate ?? null,
        goalTimeSeconds: draft.goalTimeSeconds ?? null,
        volumeMode: draft.volumeMode,
        requestedNumberOfWeeks: draft.requestedNumberOfWeeks ?? null,
        authoritativeNumberOfWeeks: draft.authoritativeNumberOfWeeks ?? null,
        includeStrength: draft.includeStrength,
        strengthEquipment: draft.strengthEquipment,
        latestObject: draft.latestObject ?? null,
        latestPreviewText: draft.latestPreviewText ?? null,
        validationStatus: presentation.validationStatus,
        latestError: presentation.latestError,
        version: draft.version,
        consumedByPlanId: draft.consumedByPlanId ? String(draft.consumedByPlanId) : null,
        updatedAt: draft.updatedAt,
      },
      messages: await mapThreadMessages(ctx, draft.threadId),
      activePlan: activePlan
        ? {
            _id: String(activePlan._id),
            goalLabel: activeGoal?.label ?? "Current plan",
          }
        : null,
    };
  },
});

export const getWeekBuilderView = query({
  args: {
    planId: v.id("trainingPlans"),
    weekNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedQueryUserId(ctx);
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
    const goal = await ctx.db.get(plan.goalId);
    const draft = await loadWeekDraft(ctx, userId, plan._id, week.weekNumber);
    const presentation = draft
      ? resolveDraftPresentationState(draft.validationStatus, draft.latestError, draft.updatedAt)
      : null;

    return {
      plan: {
        _id: String(plan._id),
        goalLabel: goal?.label ?? "Current plan",
        volumeMode: plan.volumeMode,
        peakWeekVolume: plan.peakWeekVolume,
      },
      week: {
        _id: String(week._id),
        weekNumber: week.weekNumber,
        weekStartDateKey: week.weekStartDateKey,
        weekEndDateKey: week.weekEndDateKey,
        targetVolumePercent: week.targetVolumePercent,
        targetVolumeAbsolute: week.targetVolumeAbsolute,
        emphasis: week.emphasis,
        coachNotes: week.coachNotes ?? null,
        generated: week.generated,
      },
      draft: draft
        ? {
            _id: String(draft._id),
            threadId: draft.threadId,
            latestObject: draft.latestObject ?? null,
            latestPreviewText: draft.latestPreviewText ?? null,
            validationStatus: presentation!.validationStatus,
            latestError: presentation!.latestError,
            version: draft.version,
            appliedAt: draft.appliedAt ?? null,
            updatedAt: draft.updatedAt,
          }
        : null,
      messages: draft ? await mapThreadMessages(ctx, draft.threadId) : [],
    };
  },
});

export const startPlanBuilderSession = mutation({
  args: {
    goalType: goalTypeValidator,
    goalLabel: v.string(),
    targetDate: v.optional(v.number()),
    goalTimeSeconds: v.optional(v.number()),
    volumeMode: volumeModeValidator,
    requestedNumberOfWeeks: v.optional(v.number()),
    includeStrength: v.optional(v.boolean()),
    strengthEquipment: v.optional(v.array(strengthEquipmentValidator)),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedMutationUserId(ctx);
    const goalLabel = trimNonEmpty(args.goalLabel, "goal label");
    const now = Date.now();
    const { threadId } = await planBuilderAgent.createThread(ctx, {
      userId: String(userId),
      title: `Plan: ${goalLabel}`,
    });

    const draftId = await ctx.db.insert("agentPlanDrafts", {
      userId,
      threadId,
      goalType: args.goalType,
      goalLabel,
      targetDate: args.targetDate,
      goalTimeSeconds: args.goalTimeSeconds,
      volumeMode: args.volumeMode,
      requestedNumberOfWeeks:
        typeof args.requestedNumberOfWeeks === "number" ? Math.round(args.requestedNumberOfWeeks) : undefined,
      includeStrength: args.includeStrength === true,
      strengthEquipment: args.strengthEquipment ?? [],
      validationStatus: "pending",
      version: 0,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("agentThreadRegistry", {
      userId,
      kind: "planBuilder",
      threadId,
      title: `Plan: ${goalLabel}`,
      draftId,
      createdAt: now,
      updatedAt: now,
    });

    const saved = await planBuilderAgent.saveMessage(ctx, {
      threadId,
      userId: String(userId),
      prompt: buildPlanSeedPrompt({
        goalType: args.goalType,
        goalLabel,
        targetDate: args.targetDate,
        goalTimeSeconds: args.goalTimeSeconds,
        volumeMode: args.volumeMode,
        requestedNumberOfWeeks:
          typeof args.requestedNumberOfWeeks === "number" ? Math.round(args.requestedNumberOfWeeks) : undefined,
        includeStrength: args.includeStrength === true,
        strengthEquipment: args.strengthEquipment ?? [],
      }),
      skipEmbeddings: true,
    });

    await workflow.start(ctx, internal.planningInternal.runPlanDraftUpdateWorkflow, {
      draftId,
      promptMessageId: saved.messageId,
    });

    return {
      draftId,
      threadId,
    };
  },
});

export const sendPlanBuilderMessage = mutation({
  args: {
    draftId: v.id("agentPlanDrafts"),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedMutationUserId(ctx);
    const draft = await ctx.db.get(args.draftId);
    if (!draft || draft.userId !== userId) {
      throw new Error("Plan draft not found.");
    }

    const saved = await planBuilderAgent.saveMessage(ctx, {
      threadId: draft.threadId,
      userId: String(userId),
      prompt: trimNonEmpty(args.body, "message"),
      skipEmbeddings: true,
    });

    await workflow.start(ctx, internal.planningInternal.runPlanDraftUpdateWorkflow, {
      draftId: draft._id,
      promptMessageId: saved.messageId,
    });

    return { ok: true };
  },
});

export const materializePlanDraft = mutation({
  args: {
    draftId: v.id("agentPlanDrafts"),
    peakWeekVolumeOverride: v.optional(v.number()),
    canonicalTimeZoneId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedMutationUserId(ctx);
    const draft = await ctx.db.get(args.draftId);
    if (!draft || draft.userId !== userId) {
      throw new Error("Plan draft not found.");
    }
    if (!draft.latestObject) {
      throw new Error("Plan draft is not ready yet.");
    }

    const validated = validatePlanGenerationResponse(draft.latestObject, {
      goalType: draft.goalType,
      volumeMode: draft.volumeMode,
      authoritativeNumberOfWeeks: draft.authoritativeNumberOfWeeks,
    });

    const proposal =
      typeof args.peakWeekVolumeOverride === "number" &&
      Number.isFinite(args.peakWeekVolumeOverride) &&
      args.peakWeekVolumeOverride > 0
        ? {
            ...validated.proposal,
            peakWeekVolume: Math.round(args.peakWeekVolumeOverride * 10) / 10,
          }
        : validated.proposal;

    const activated = await materializeDraftPlanFromAgentDraft(
      ctx,
      draft,
      proposal,
      args.canonicalTimeZoneId?.trim() || "UTC",
    );
    await ctx.db.patch(draft._id, {
      consumedByPlanId: activated.planId,
      updatedAt: Date.now(),
    });

    return {
      planId: activated.planId,
      currentWeekNumber: activated.currentWeekNumber,
    };
  },
});

export const startWeekBuilderSession = mutation({
  args: {
    planId: v.id("trainingPlans"),
    weekNumber: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedMutationUserId(ctx);
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
    const goal = await ctx.db.get(plan.goalId);
    let draft = await loadWeekDraft(ctx, userId, plan._id, week.weekNumber);
    if (!draft) {
      const now = Date.now();
      const { threadId } = await weekBuilderAgent.createThread(ctx, {
        userId: String(userId),
        title: `Week ${week.weekNumber}: ${goal?.label ?? "Plan"}`,
      });
      const draftId = await ctx.db.insert("agentWeekDrafts", {
        userId,
        threadId,
        planId: plan._id,
        weekId: week._id,
        weekNumber: week.weekNumber,
        validationStatus: "pending",
        version: 0,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("agentThreadRegistry", {
        userId,
        kind: "weekBuilder",
        threadId,
        title: `Week ${week.weekNumber}: ${goal?.label ?? "Plan"}`,
        weekDraftId: draftId,
        planId: plan._id,
        weekNumber: week.weekNumber,
        createdAt: now,
        updatedAt: now,
      });
      draft = await ctx.db.get(draftId);
    }

    const saved = await weekBuilderAgent.saveMessage(ctx, {
      threadId: draft!.threadId,
      userId: String(userId),
      prompt: buildWeekSeedPrompt({
        goalLabel: goal?.label ?? "Current plan",
        weekNumber: week.weekNumber,
        emphasis: week.emphasis,
        note: args.note?.trim() || undefined,
      }),
      skipEmbeddings: true,
    });

    await workflow.start(ctx, internal.planningInternal.runWeekDraftUpdateWorkflow, {
      weekDraftId: draft!._id,
      promptMessageId: saved.messageId,
    });

    return {
      weekDraftId: draft!._id,
      threadId: draft!.threadId,
    };
  },
});

export const sendWeekBuilderMessage = mutation({
  args: {
    weekDraftId: v.id("agentWeekDrafts"),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedMutationUserId(ctx);
    const draft = await ctx.db.get(args.weekDraftId);
    if (!draft || draft.userId !== userId) {
      throw new Error("Week draft not found.");
    }

    const saved = await weekBuilderAgent.saveMessage(ctx, {
      threadId: draft.threadId,
      userId: String(userId),
      prompt: trimNonEmpty(args.body, "message"),
      skipEmbeddings: true,
    });

    await workflow.start(ctx, internal.planningInternal.runWeekDraftUpdateWorkflow, {
      weekDraftId: draft._id,
      promptMessageId: saved.messageId,
    });

    return { ok: true };
  },
});

export const applyWeekDraft = mutation({
  args: {
    weekDraftId: v.id("agentWeekDrafts"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedMutationUserId(ctx);
    const draft = await ctx.db.get(args.weekDraftId);
    if (!draft || draft.userId !== userId) {
      throw new Error("Week draft not found.");
    }
    if (!draft.latestObject) {
      throw new Error("Week draft is not ready yet.");
    }

    const plan = await ctx.db.get(draft.planId);
    const week = await ctx.db.get(draft.weekId);
    if (!plan || !week) {
      throw new Error("Week context could not be loaded.");
    }

    const [runningSchedule, existingWorkouts, existingStrengthWorkouts, executionSummaryByPlannedWorkoutId, racesInPlan, user] =
      await Promise.all([
        ctx.db
          .query("runningSchedules")
          .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
          .unique(),
        ctx.db.query("workouts").withIndex("by_week_id", (queryBuilder) => queryBuilder.eq("weekId", week._id)).collect(),
        ctx.db
          .query("strengthWorkouts")
          .withIndex("by_week_id", (queryBuilder) => queryBuilder.eq("weekId", week._id))
          .collect(),
        listExecutionSummariesByPlannedWorkoutId(ctx, userId),
        ctx.db.query("races").withIndex("by_plan_id", (queryBuilder) => queryBuilder.eq("planId", plan._id)).collect(),
        ctx.db.get(userId),
      ]);

    const availabilityOverride = normalizeAvailabilityOverride(week.availabilityOverride);
    const lockedWorkouts: WeekDetailWorkoutProposal[] = existingWorkouts
      .filter((workout) => executionSummaryByPlannedWorkoutId.get(String(workout._id))?.matchStatus === "matched")
      .map((workout) => ({
        type: workout.type,
        volumePercent: workout.volumePercent,
        scheduledDate: workout.scheduledDateKey as DateKey,
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

    const validated = validateWeekDetailResponse(draft.latestObject, {
      weekStartDateKey: week.weekStartDateKey as DateKey,
      weekEndDateKey: week.weekEndDateKey as DateKey,
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
        userId,
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
      updatedAt: now,
    });
    await ctx.db.patch(draft._id, {
      latestObject: validated.proposal,
      validationStatus: "valid",
      latestError: undefined,
      appliedAt: now,
      updatedAt: now,
    });

    return { ok: true };
  },
});
