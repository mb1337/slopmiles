import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

import { internal } from "./_generated/api";
import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { validatePlanGenerationResponse, type PlanGenerationProposal } from "./coachContracts";
import { buildPlanGenerationMessages } from "./coachPrompts";
import { aiCallTypes, aiRequestPriorities, aiRequestStatuses, goalTypes, volumeModes } from "./constants";

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

export const createPlanFromGeneration = mutation({
  args: {
    requestId: v.id("aiRequests"),
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

    const planId = await materializeDraftPlanFromValidatedProposal(ctx, request, proposal);
    const now = Date.now();
    await ctx.db.patch(request._id, {
      consumedByPlanId: planId,
      updatedAt: now,
    });

    const plan = await ctx.db.get(planId);
    if (!plan) {
      throw new Error("Generated plan could not be loaded after creation.");
    }

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
