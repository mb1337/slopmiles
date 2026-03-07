import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

import { internal } from "./_generated/api";
import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { validatePlanGenerationResponse, type PlanGenerationProposal } from "./coachContracts";
import { buildPlanGenerationMessages, buildWeekDetailGenerationMessages } from "./coachPrompts";
import { validateWeekDetailResponse } from "./weekDetailContracts";
import { aiCallTypes, aiRequestPriorities, aiRequestStatuses, goalTypes, volumeModes } from "./constants";
import { isWeekGeneratable, resolveAbsoluteWeekVolume } from "./planWeeks";

declare const process:
  | {
      env?: Record<string, string | undefined>;
    }
  | undefined;

const goalTypeValidator = v.union(...goalTypes.map((goalType) => v.literal(goalType)));
const volumeModeValidator = v.union(...volumeModes.map((mode) => v.literal(mode)));

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
const PLAN_GENERATION_PROMPT_REVISION = "plan-generation-v1";
const PLAN_GENERATION_SCHEMA_REVISION = "plan-generation-v1";
const WEEK_DETAIL_PROMPT_REVISION = "week-detail-v1";
const WEEK_DETAIL_SCHEMA_REVISION = "week-detail-v1";
const DEFAULT_OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_OPENROUTER_MODEL = "openai/gpt-5-mini";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

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

function buildCoachReply(args: {
  message: string;
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
  const lower = args.message.toLowerCase();
  const styleLead = args.personalityDescription.toLowerCase().includes("data")
    ? `Current fitness marker: VDOT ${typeof args.currentVDOT === "number" ? args.currentVDOT.toFixed(1) : "not set yet"}. `
    : args.personalityDescription.toLowerCase().includes("calm")
      ? "Take the next decision one block at a time. "
      : args.personalityDescription.toLowerCase().includes("celebratory")
        ? "You've got momentum to work with. "
        : "";

  const competitivenessNote =
    args.competitiveness === "aggressive"
      ? "Because you chose aggressive coaching, I'd only push through if the underlying issue is clearly schedule noise and not fatigue."
      : args.competitiveness === "conservative"
        ? "Because you chose conservative coaching, protecting recovery is the default call."
        : "Balanced mode means we can adapt without overreacting.";

  const planLine = args.activePlan
    ? `Active plan: ${args.activePlan.goalLabel}, ${args.activePlan.numberOfWeeks} weeks, peak ${formatVolumeSummary(args.activePlan.volumeMode, args.activePlan.peakWeekVolume)}. `
    : "You do not have an active plan yet. ";

  if (lower.includes("skip") || lower.includes("miss") || lower.includes("can't run") || lower.includes("cannot run")) {
    const scheduleLine = args.runningSchedule
      ? `Your current schedule is ${args.runningSchedule.runningDaysPerWeek} days across ${args.runningSchedule.preferredRunningDays.join(", ")}. `
      : "";
    return `${styleLead}${planLine}${scheduleLine}If a workout needs to go, protect the long run and the most important quality day, then drop secondary volume first. ${competitivenessNote}`;
  }

  if (lower.includes("injur") || lower.includes("pain") || lower.includes("sick") || lower.includes("ill")) {
    return `${styleLead}${planLine}Treat this as a recovery problem before a motivation problem. Reduce intensity immediately, and if symptoms are not clearly resolving, pause the plan and rebuild from there. ${competitivenessNote}`;
  }

  if (lower.includes("goal") || lower.includes("race") || lower.includes("plan")) {
    return `${styleLead}${planLine}If the goal has changed, create a fresh draft around the new target and compare peak volume, timeline, and emphasis before activating it. ${competitivenessNote}`;
  }

  if (lower.includes("schedule") || lower.includes("day") || lower.includes("long run") || lower.includes("quality")) {
    const longRunLine =
      args.runningSchedule?.preferredLongRunDay ? ` Long run preference is ${args.runningSchedule.preferredLongRunDay}.` : "";
    return `${styleLead}${planLine}Use Settings to keep preferred days honest to real life; the coach should adapt to constraints, not pretend they do not exist.${longRunLine}`;
  }

  return `${styleLead}${planLine}Ask for changes in concrete terms: target race, target date, peak volume, or schedule constraint. I can help you pressure-test the tradeoffs before you commit.`;
}

function computeRaceWeeks(targetDate: number): number {
  const now = Date.now();
  if (!Number.isFinite(targetDate)) {
    throw new Error("targetDate must be a finite timestamp.");
  }
  if (targetDate <= now) {
    throw new Error("Race targetDate must be in the future.");
  }

  const rawWeeks = Math.ceil((targetDate - now) / MS_PER_WEEK);
  return clamp(rawWeeks, 4, 52);
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

function createDedupeKey(input: {
  goalType: (typeof goalTypes)[number];
  goalLabel: string;
  targetDate?: number;
  goalTimeSeconds?: number;
  volumeMode: (typeof volumeModes)[number];
  requestedNumberOfWeeks?: number;
  authoritativeNumberOfWeeks?: number;
}): string {
  return [
    "planGeneration",
    input.goalType,
    input.goalLabel.trim().toLowerCase(),
    input.targetDate ?? "none",
    input.goalTimeSeconds ?? "none",
    input.volumeMode,
    input.requestedNumberOfWeeks ?? "none",
    input.authoritativeNumberOfWeeks ?? "none",
    PLAN_GENERATION_PROMPT_REVISION,
    PLAN_GENERATION_SCHEMA_REVISION,
  ].join("|");
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

function asPlanGenerationInput(
  value: unknown,
): {
  goalType: (typeof goalTypes)[number];
  goalLabel: string;
  targetDate?: number;
  goalTimeSeconds?: number;
  volumeMode: (typeof volumeModes)[number];
  requestedNumberOfWeeks?: number;
  authoritativeNumberOfWeeks?: number;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid AI request input payload.");
  }

  const candidate = value as Record<string, unknown>;
  const goalType = candidate.goalType as (typeof goalTypes)[number];
  const goalLabel = candidate.goalLabel;
  const volumeMode = candidate.volumeMode as (typeof volumeModes)[number];
  if (!goalTypes.includes(goalType)) {
    throw new Error("Invalid AI request goalType.");
  }
  if (typeof goalLabel !== "string") {
    throw new Error("Invalid AI request goalLabel.");
  }
  if (!volumeModes.includes(volumeMode)) {
    throw new Error("Invalid AI request volumeMode.");
  }

  const targetDate = typeof candidate.targetDate === "number" ? candidate.targetDate : undefined;
  const goalTimeSeconds = typeof candidate.goalTimeSeconds === "number" ? candidate.goalTimeSeconds : undefined;
  const requestedNumberOfWeeks =
    typeof candidate.requestedNumberOfWeeks === "number" ? candidate.requestedNumberOfWeeks : undefined;
  const authoritativeNumberOfWeeks =
    typeof candidate.authoritativeNumberOfWeeks === "number" ? candidate.authoritativeNumberOfWeeks : undefined;

  return {
    goalType,
    goalLabel,
    targetDate,
    goalTimeSeconds,
    volumeMode,
    requestedNumberOfWeeks,
    authoritativeNumberOfWeeks,
  };
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

function asMetadata(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function extractStoredPlanProposal(value: unknown): PlanGenerationProposal | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as {
    numberOfWeeks?: unknown;
    peakWeekVolume?: unknown;
    weeklyVolumeProfile?: unknown;
    weeklyEmphasis?: unknown;
    rationale?: unknown;
    strengthApproach?: unknown;
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
    weeklyVolumeProfile: candidate.weeklyVolumeProfile as PlanGenerationProposal["weeklyVolumeProfile"],
    weeklyEmphasis: candidate.weeklyEmphasis as PlanGenerationProposal["weeklyEmphasis"],
    rationale: candidate.rationale,
    ...(typeof candidate.strengthApproach === "string" ? { strengthApproach: candidate.strengthApproach } : {}),
  };
}

async function materializeDraftPlanFromValidatedProposal(
  ctx: MutationCtx,
  request: Doc<"aiRequests">,
  proposal: PlanGenerationProposal,
): Promise<Id<"trainingPlans">> {
  if (request.consumedByPlanId) {
    const existingPlan = await ctx.db.get(request.consumedByPlanId);
    if (existingPlan) {
      return existingPlan._id;
    }
  }

  const input = asPlanGenerationInput(request.input);
  const now = Date.now();

  const goalId = await ctx.db.insert("goals", {
    userId: request.userId,
    type: input.goalType,
    label: input.goalLabel,
    targetDate: input.targetDate,
    goalTimeSeconds: input.goalTimeSeconds,
    createdAt: now,
  });

  return await ctx.db.insert("trainingPlans", {
    userId: request.userId,
    goalId,
    numberOfWeeks: proposal.numberOfWeeks,
    volumeMode: input.volumeMode,
    peakWeekVolume: proposal.peakWeekVolume,
    weeklyVolumeProfile: proposal.weeklyVolumeProfile,
    weeklyEmphasis: proposal.weeklyEmphasis,
    generationRationale: proposal.rationale,
    generatedByAiRequestId: request._id,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  });
}

function resolveAssistantContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (!item || typeof item !== "object") {
          return "";
        }
        const part = item as { type?: unknown; text?: unknown };
        if (part.type === "text" && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .join("");
  }

  return "";
}

function parseJsonPayloadFromModel(content: string): unknown {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    throw new Error("AI returned an empty response.");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("AI response was not valid JSON.");
  }
}

async function callOpenRouter(messages: Array<{ role: "system" | "user"; content: string }>) {
  const apiKey = process?.env?.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured.");
  }

  const model = process?.env?.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL;
  const url = process?.env?.OPENROUTER_URL?.trim() || DEFAULT_OPENROUTER_URL;
  const referer = process?.env?.OPENROUTER_REFERER?.trim() || process?.env?.CONVEX_SITE_URL?.trim();

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(referer ? { "HTTP-Referer": referer } : {}),
      "X-Title": "SlopMiles",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      response_format: {
        type: "json_object",
      },
    }),
  });

  if (!response.ok) {
    const failureText = await response.text();
    throw new Error(`OpenRouter request failed (${response.status}): ${failureText.slice(0, 400)}`);
  }

  const payload = (await response.json()) as {
    id?: string;
    choices?: Array<{
      message?: {
        content?: unknown;
      };
    }>;
  };

  const content = resolveAssistantContent(payload.choices?.[0]?.message?.content);
  if (!content) {
    throw new Error("OpenRouter did not return a usable assistant message.");
  }

  return {
    requestId: payload.id,
    model,
    content,
  };
}

export const requestPlanGeneration = mutation({
  args: {
    goalType: goalTypeValidator,
    goalLabel: v.string(),
    targetDate: v.optional(v.number()),
    goalTimeSeconds: v.optional(v.number()),
    volumeMode: volumeModeValidator,
    requestedNumberOfWeeks: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedMutationUserId(ctx);
    const goalLabel = trimNonEmpty(args.goalLabel);

    if (args.goalType === "race" && typeof args.targetDate !== "number") {
      throw new Error("Race goals require targetDate.");
    }

    const authoritativeNumberOfWeeks =
      args.goalType === "race" && typeof args.targetDate === "number"
        ? computeRaceWeeks(args.targetDate)
        : undefined;

    const input = {
      goalType: args.goalType,
      goalLabel,
      targetDate: args.targetDate,
      goalTimeSeconds: args.goalTimeSeconds,
      volumeMode: args.volumeMode,
      requestedNumberOfWeeks:
        typeof args.requestedNumberOfWeeks === "number" ? Math.round(args.requestedNumberOfWeeks) : undefined,
      authoritativeNumberOfWeeks,
    };

    const dedupeKey = createDedupeKey(input);
    const existing = await ctx.db
      .query("aiRequests")
      .withIndex("by_user_id_call_type_dedupe_key", (q) =>
        q.eq("userId", userId).eq("callType", "planGeneration").eq("dedupeKey", dedupeKey),
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
      callType: aiCallTypes[0],
      status: aiRequestStatuses[0],
      priority: aiRequestPriorities[0],
      dedupeKey,
      input,
      attemptCount: 0,
      maxAttempts: 1,
      promptRevision: PLAN_GENERATION_PROMPT_REVISION,
      schemaRevision: PLAN_GENERATION_SCHEMA_REVISION,
      createdAt: now,
      updatedAt: now,
    });

    await insertCoachEvent(
      ctx,
      userId,
      `Generating a ${input.goalLabel} plan with ${input.volumeMode}-based volume and ${
        input.authoritativeNumberOfWeeks ?? input.requestedNumberOfWeeks ?? "coach-selected"
      } weeks of structure.`,
      undefined,
      requestId,
    );

    await ctx.scheduler.runAfter(0, internal.coach.processPlanGenerationRequest, {
      requestId,
    });

    return {
      requestId,
      status: "queued" as const,
      deduped: false,
    };
  },
});

export const getPlanGenerationRequest = query({
  args: {
    requestId: v.id("aiRequests"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedQueryUserId(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request || request.userId !== userId || request.callType !== "planGeneration") {
      throw new Error("Plan-generation request not found.");
    }

    return {
      _id: request._id,
      status: request.status,
      attemptCount: request.attemptCount,
      maxAttempts: request.maxAttempts,
      errorCode: request.errorCode,
      errorMessage: request.errorMessage,
      result: request.result,
      consumedByPlanId: request.consumedByPlanId,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      completedAt: request.completedAt,
      nextRetryAt: request.nextRetryAt,
    };
  },
});

export const getLatestPlanGenerationRequest = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuthenticatedQueryUserId(ctx);
    const requests = await ctx.db
      .query("aiRequests")
      .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
      .collect();

    const latestRequest = requests
      .filter((request) => request.callType === "planGeneration")
      .sort((left, right) => right.createdAt - left.createdAt)[0];

    if (!latestRequest) {
      return null;
    }

    return {
      _id: latestRequest._id,
      status: latestRequest.status,
      attemptCount: latestRequest.attemptCount,
      maxAttempts: latestRequest.maxAttempts,
      errorCode: latestRequest.errorCode,
      errorMessage: latestRequest.errorMessage,
      result: latestRequest.result,
      consumedByPlanId: latestRequest.consumedByPlanId,
      createdAt: latestRequest.createdAt,
      updatedAt: latestRequest.updatedAt,
      completedAt: latestRequest.completedAt,
      nextRetryAt: latestRequest.nextRetryAt,
    };
  },
});

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

    await ctx.scheduler.runAfter(0, internal.coach.processWeekDetailGenerationRequest, {
      requestId,
    });

    return {
      requestId,
      status: "queued" as const,
      deduped: false,
    };
  },
});

export const getCoachConversation = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuthenticatedQueryUserId(ctx);
    const [user, runningSchedule, competitiveness, personality, plans, messages] = await Promise.all([
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
        .query("trainingPlans")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
        .collect(),
      ctx.db
        .query("coachMessages")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
        .collect(),
    ]);

    const activePlan = plans.find((plan) => plan.status === "active") ?? null;
    const draftPlans = plans.filter((plan) => plan.status === "draft");
    const sortedMessages = [...messages].sort((left, right) => left.createdAt - right.createdAt).slice(-40);

    const fallbackMessage =
      sortedMessages.length === 0
        ? [
            {
              _id: "coach-intro",
              author: "coach" as const,
              kind: "message" as const,
              body: activePlan
                ? `Active plan loaded. ${activePlan.numberOfWeeks} weeks, peak ${formatVolumeSummary(activePlan.volumeMode, activePlan.peakWeekVolume)}. Ask for schedule or goal tradeoffs in plain language.`
                : "No active plan yet. Use this tab to pressure-test goals, schedule constraints, or the shape of a new draft before you commit.",
              createdAt: Date.now(),
            },
          ]
        : [];

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
            numberOfWeeks: activePlan.numberOfWeeks,
            volumeMode: activePlan.volumeMode,
            peakWeekVolume: activePlan.peakWeekVolume,
          }
        : null,
      draftPlanCount: draftPlans.length,
      messages:
        sortedMessages.length > 0
          ? sortedMessages.map((message) => ({
              _id: String(message._id),
              author: message.author,
              kind: message.kind,
              body: message.body,
              createdAt: message.createdAt,
            }))
          : fallbackMessage,
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
    const [user, runningSchedule, competitiveness, personality, plans] = await Promise.all([
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
        .query("trainingPlans")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
        .collect(),
    ]);

    const activePlan = plans.find((plan) => plan.status === "active") ?? null;

    await ctx.db.insert("coachMessages", {
      userId,
      author: "user",
      kind: "message",
      body,
      planId: activePlan?._id,
      createdAt: Date.now(),
    });

    const reply = buildCoachReply({
      message: body,
      personalityDescription: personality?.description ?? "Brief, direct, no fluff.",
      competitiveness: competitiveness?.level ?? "balanced",
      activePlan: activePlan
        ? {
            goalLabel: (await ctx.db.get(activePlan.goalId))?.label ?? "current plan",
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
    });

    await ctx.db.insert("coachMessages", {
      userId,
      author: "coach",
      kind: "message",
      body: reply,
      planId: activePlan?._id,
      createdAt: Date.now(),
    });

    return {
      ok: true,
    };
  },
});

export const retryPlanGeneration = mutation({
  args: {
    requestId: v.id("aiRequests"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedMutationUserId(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request || request.userId !== userId || request.callType !== "planGeneration") {
      throw new Error("Plan-generation request not found.");
    }

    if (request.status !== "failed") {
      throw new Error("Only failed requests can be retried manually.");
    }

    await ctx.db.patch(request._id, {
      status: "queued",
      errorCode: undefined,
      errorMessage: undefined,
      nextRetryAt: undefined,
      completedAt: undefined,
      updatedAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.coach.processPlanGenerationRequest, {
      requestId: request._id,
    });

    return {
      requestId: request._id,
      status: "queued" as const,
    };
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

    await ctx.scheduler.runAfter(0, internal.coach.processWeekDetailGenerationRequest, {
      requestId: request._id,
    });

    return {
      requestId: request._id,
      status: "queued" as const,
    };
  },
});

export const createPlanFromGeneration = mutation({
  args: {
    requestId: v.id("aiRequests"),
    peakWeekVolumeOverride: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedMutationUserId(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request || request.userId !== userId || request.callType !== "planGeneration") {
      throw new Error("Plan-generation request not found.");
    }

    if (request.status !== "succeeded") {
      throw new Error("Plan proposal is not ready yet.");
    }

    if (request.consumedByPlanId) {
      const existingPlan = await ctx.db.get(request.consumedByPlanId);
      if (!existingPlan) {
        throw new Error("Generated draft reference is no longer available.");
      }
      return {
        plan: existingPlan,
        status: existingPlan.status,
        createdAsDraft: existingPlan.status === "draft",
        activePlanId: null,
      };
    }

    const proposal = extractStoredPlanProposal(request.result);
    if (!proposal) {
      throw new Error("Plan proposal payload is unavailable. Generate a new proposal and try again.");
    }

    const adjustedProposal =
      typeof args.peakWeekVolumeOverride === "number" && Number.isFinite(args.peakWeekVolumeOverride) && args.peakWeekVolumeOverride > 0
        ? {
            ...proposal,
            peakWeekVolume: Math.round(args.peakWeekVolumeOverride * 10) / 10,
          }
        : proposal;

    const planId = await materializeDraftPlanFromValidatedProposal(ctx, request, adjustedProposal);
    const now = Date.now();
    await ctx.db.patch(request._id, {
      consumedByPlanId: planId,
      updatedAt: now,
    });

    const plan = await ctx.db.get(planId);
    if (!plan) {
      throw new Error("Generated plan could not be loaded after creation.");
    }

    const goal = await ctx.db.get(plan.goalId);
    await insertCoachEvent(
      ctx,
      userId,
      `Draft ready${goal ? ` for ${goal.label}` : ""}. Peak volume is ${formatVolumeSummary(plan.volumeMode, plan.peakWeekVolume)} until you decide to activate it.`,
      plan._id,
      request._id,
    );

    return {
      plan,
      status: plan.status,
      createdAsDraft: plan.status === "draft",
      activePlanId: null,
    };
  },
});

export const getPlanGenerationContext = internalQuery({
  args: {
    requestId: v.id("aiRequests"),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request || request.callType !== "planGeneration") {
      return null;
    }

    const input = asPlanGenerationInput(request.input);

    const user = await ctx.db.get(request.userId);
    if (!user) {
      return null;
    }

    const competitiveness = await ctx.db
      .query("competitiveness")
      .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", request.userId))
      .unique();
    const runningSchedule = await ctx.db
      .query("runningSchedules")
      .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", request.userId))
      .unique();
    const personality = await ctx.db
      .query("personalities")
      .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", request.userId))
      .unique();

    const healthKitWorkouts = await ctx.db
      .query("healthKitWorkouts")
      .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", request.userId))
      .collect();

    const twelveWeeksAgo = Date.now() - 84 * 24 * 60 * 60 * 1000;

    const recentWorkouts = healthKitWorkouts
      .filter((workout) => workout.startedAt >= twelveWeeksAgo)
      .sort((left, right) => right.startedAt - left.startedAt)
      .slice(0, 60)
      .map((workout) => ({
        startedAt: workout.startedAt,
        durationSeconds: workout.durationSeconds,
        distanceMeters: workout.distanceMeters,
        averageHeartRate: workout.averageHeartRate,
      }));

    return {
      request,
      input,
      promptInput: {
        goalType: input.goalType,
        goalLabel: input.goalLabel,
        targetDate: input.targetDate,
        goalTimeSeconds: input.goalTimeSeconds,
        volumeMode: input.volumeMode,
        authoritativeNumberOfWeeks: input.authoritativeNumberOfWeeks,
        requestedNumberOfWeeks: input.requestedNumberOfWeeks,
        competitiveness: competitiveness?.level ?? "balanced",
        personalityDescription: personality?.description ?? "Direct and concise coaching.",
        unitPreference: user.unitPreference,
        scheduleConstraints: {
          targetRunningDaysPerWeek: runningSchedule?.runningDaysPerWeek ?? 5,
          availableDaysPerWeek: runningSchedule?.preferredRunningDays.length ?? 7,
        },
        currentVDOT: user.currentVDOT,
        recentWorkouts,
      },
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

    const healthKitWorkouts = await ctx.db
      .query("healthKitWorkouts")
      .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", request.userId))
      .collect();

    const recentWorkouts = healthKitWorkouts
      .sort((left, right) => right.startedAt - left.startedAt)
      .slice(0, 20)
      .map((workout) => ({
        startedAt: workout.startedAt,
        durationSeconds: workout.durationSeconds,
        distanceMeters: workout.distanceMeters,
        averageHeartRate: workout.averageHeartRate,
      }));

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
        preferredRunningDays: runningSchedule?.preferredRunningDays ?? [
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
          "sunday",
        ],
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

export const finalizePlanGenerationSuccess = internalMutation({
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

    if (request.callType !== "planGeneration") {
      throw new Error("finalizePlanGenerationSuccess only supports planGeneration requests.");
    }

    const input = asPlanGenerationInput(request.input);
    const validated = validatePlanGenerationResponse(args.proposal, {
      goalType: input.goalType,
      volumeMode: input.volumeMode,
      authoritativeNumberOfWeeks: input.authoritativeNumberOfWeeks,
    });

    const metadata = asMetadata(args.metadata);

    const result = {
      ...validated.proposal,
      ...(metadata ? { metadata } : {}),
      corrections: validated.corrections,
    };

    const now = Date.now();
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
      body: `Plan proposal ready for review. Peak volume ${formatVolumeSummary(input.volumeMode, validated.proposal.peakWeekVolume)} across ${validated.proposal.numberOfWeeks} weeks.`,
      relatedRequestId: request._id,
      createdAt: now,
    });

    return {
      corrections: validated.corrections,
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

    const runningSchedule = await ctx.db
      .query("runningSchedules")
      .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", request.userId))
      .unique();

    const validated = validateWeekDetailResponse(args.proposal, {
      weekStartDateKey: week.weekStartDateKey as `${number}-${string}-${string}`,
      weekEndDateKey: week.weekEndDateKey as `${number}-${string}-${string}`,
      targetVolumePercent: week.targetVolumePercent,
      preferredRunningDays:
        runningSchedule?.preferredRunningDays ?? [
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
          "sunday",
        ],
      trackAccess: Boolean((await ctx.db.get(request.userId))?.trackAccess),
    });

    const metadata = asMetadata(args.metadata);
    const result = {
      ...validated.proposal,
      ...(metadata ? { metadata } : {}),
      corrections: validated.corrections,
    };

    const existingWorkouts = await ctx.db
      .query("workouts")
      .withIndex("by_week_id", (queryBuilder) => queryBuilder.eq("weekId", week._id))
      .collect();
    for (const workout of existingWorkouts) {
      await ctx.db.delete(workout._id);
    }

    const now = Date.now();
    for (const workout of validated.proposal.workouts) {
      await ctx.db.insert("workouts", {
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

    await ctx.db.patch(week._id, {
      coachNotes: validated.proposal.coachNotes,
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

export const markRequestQueuedForRetry = internalMutation({
  args: {
    requestId: v.id("aiRequests"),
    errorCode: v.string(),
    errorMessage: v.string(),
    nextRetryAt: v.number(),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) {
      return;
    }

    await ctx.db.patch(request._id, {
      status: "queued",
      errorCode: args.errorCode,
      errorMessage: args.errorMessage,
      nextRetryAt: args.nextRetryAt,
      updatedAt: Date.now(),
    });
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

export const processPlanGenerationRequest = internalAction({
  args: {
    requestId: v.id("aiRequests"),
  },
  handler: async (ctx, args) => {
    const started = await ctx.runMutation(internal.coach.markRequestInProgress, {
      requestId: args.requestId,
    });
    if (!started) {
      return;
    }

    try {
      const context = await ctx.runQuery(internal.coach.getPlanGenerationContext, {
        requestId: args.requestId,
      });
      if (!context) {
        throw new Error("Could not load plan-generation context.");
      }

      const messages = buildPlanGenerationMessages(context.promptInput);
      const providerResponse = await callOpenRouter(messages);
      const parsed = parseJsonPayloadFromModel(providerResponse.content);

      const finalized = await ctx.runMutation(internal.coach.finalizePlanGenerationSuccess, {
        requestId: args.requestId,
        proposal: parsed,
        metadata: {
          model: providerResponse.model,
          providerRequestId: providerResponse.requestId,
        },
      });

      if (finalized && finalized.corrections.length > 0) {
        await ctx.runMutation(internal.coach.appendDiagnostic, {
          requestId: args.requestId,
          code: "PLAN_GENERATION_AUTO_CORRECTED",
          message: "Applied deterministic corrections to AI plan proposal.",
          details: {
            corrections: finalized.corrections,
          },
        });
      }
    } catch (error) {
      const message = errorMessage(error);
      await ctx.runMutation(internal.coach.appendDiagnostic, {
        requestId: args.requestId,
        code: "PLAN_GENERATION_FAILED",
        message,
      });

      await ctx.runMutation(internal.coach.markRequestFailed, {
        requestId: args.requestId,
        errorCode: "PLAN_GENERATION_FAILED",
        errorMessage: message,
      });
    }
  },
});

export const processWeekDetailGenerationRequest = internalAction({
  args: {
    requestId: v.id("aiRequests"),
  },
  handler: async (ctx, args) => {
    const started = await ctx.runMutation(internal.coach.markRequestInProgress, {
      requestId: args.requestId,
    });
    if (!started) {
      return;
    }

    try {
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
      const providerResponse = await callOpenRouter(messages);
      const parsed = parseJsonPayloadFromModel(providerResponse.content);

      const finalized = await ctx.runMutation(internal.coach.finalizeWeekDetailGenerationSuccess, {
        requestId: args.requestId,
        proposal: parsed,
        metadata: {
          model: providerResponse.model,
          providerRequestId: providerResponse.requestId,
        },
      });

      if (finalized && finalized.corrections.length > 0) {
        await ctx.runMutation(internal.coach.appendDiagnostic, {
          requestId: args.requestId,
          code: "WEEK_DETAIL_AUTO_CORRECTED",
          message: "Applied deterministic corrections to AI week-detail proposal.",
          details: {
            corrections: finalized.corrections,
          },
        });
      }
    } catch (error) {
      const message = errorMessage(error);
      await ctx.runMutation(internal.coach.appendDiagnostic, {
        requestId: args.requestId,
        code: "WEEK_DETAIL_GENERATION_FAILED",
        message,
      });

      await ctx.runMutation(internal.coach.markRequestFailed, {
        requestId: args.requestId,
        errorCode: "WEEK_DETAIL_GENERATION_FAILED",
        errorMessage: message,
      });
    }
  },
});

export const generatePlanProposalNow = action({
  args: {
    requestId: v.id("aiRequests"),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(internal.coach.processPlanGenerationRequest, {
      requestId: args.requestId,
    });
    return {
      requestId: args.requestId,
    };
  },
});
