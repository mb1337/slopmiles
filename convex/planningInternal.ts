import { WorkflowManager } from "@convex-dev/workflow";
import { v } from "convex/values";

import { components, internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { planDraftSchema, weekDraftSchema } from "./agentSchemas";
import { describeAiError } from "./aiHelpers";
import {
  buildPlanBuilderInstructions,
  buildWeekBuilderInstructions,
  planBuilderAgent,
  weekBuilderAgent,
} from "./agentRuntime";
import { validatePlanGenerationResponse } from "./coachContracts";
import { buildPlanGenerationMessages, buildWeekDetailGenerationMessages } from "./coachPrompts";
import {
  type PlanDraftContext,
  type WeekDraftContext,
  buildPlanConversationSupportMessage,
  buildWeekConversationSupportMessage,
  effectivePreferredRunningDays,
  normalizeAvailabilityOverride,
  resolveWeekVolumeTargetMode,
} from "./planning";
import { validateWeekDetailResponse, type WeekDetailWorkoutProposal } from "./weekDetailContracts";
import { dateKeyFromEpochMs, type DateKey } from "../packages/domain/src/calendar";
import { listExecutionSummariesByPlannedWorkoutId } from "./workoutExecutionHelpers";

const workflow = new WorkflowManager(components.workflow);

export const getPlanDraftGenerationContext = internalQuery({
  args: {
    draftId: v.id("agentPlanDrafts"),
  },
  handler: async (ctx, args): Promise<PlanDraftContext | null> => {
    const draft = await ctx.db.get(args.draftId);
    if (!draft) {
      return null;
    }

    const [user, competitiveness, runningSchedule, personality, healthKitWorkouts] = await Promise.all([
      ctx.db.get(draft.userId),
      ctx.db
        .query("competitiveness")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", draft.userId))
        .unique(),
      ctx.db
        .query("runningSchedules")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", draft.userId))
        .unique(),
      ctx.db
        .query("personalities")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", draft.userId))
        .unique(),
      ctx.db
        .query("healthKitWorkouts")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", draft.userId))
        .collect(),
    ]);
    if (!user) {
      return null;
    }

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

    const messages = buildPlanGenerationMessages({
      goalType: draft.goalType,
      goalLabel: draft.goalLabel,
      targetDate: draft.targetDate,
      goalTimeSeconds: draft.goalTimeSeconds,
      volumeMode: draft.volumeMode,
      authoritativeNumberOfWeeks: draft.authoritativeNumberOfWeeks,
      requestedNumberOfWeeks: draft.requestedNumberOfWeeks,
      includeStrength: draft.includeStrength,
      strengthEquipment: draft.strengthEquipment,
      competitiveness: competitiveness?.level ?? "balanced",
      personalityDescription: personality?.description ?? "Direct and concise coaching.",
      unitPreference: user.unitPreference,
      scheduleConstraints: {
        targetRunningDaysPerWeek: runningSchedule?.runningDaysPerWeek ?? 5,
        availableDaysPerWeek: runningSchedule?.preferredRunningDays.length ?? 7,
      },
      currentVDOT: user.currentVDOT,
      recentWorkouts,
    });

    return {
      draft,
      promptPayload: String(messages[1]?.content ?? ""),
      personalityDescription: personality?.description ?? "Direct and concise coaching.",
      competitiveness: competitiveness?.level ?? "balanced",
      currentDraftObject: draft.latestObject ?? null,
    };
  },
});

export const getWeekDraftGenerationContext = internalQuery({
  args: {
    weekDraftId: v.id("agentWeekDrafts"),
  },
  handler: async (ctx, args): Promise<WeekDraftContext | null> => {
    const draft = await ctx.db.get(args.weekDraftId);
    if (!draft) {
      return null;
    }
    const [plan, week] = await Promise.all([ctx.db.get(draft.planId), ctx.db.get(draft.weekId)]);
    if (!plan || !week) {
      return null;
    }

    const [
      user,
      goal,
      competitiveness,
      runningSchedule,
      personality,
      healthKitWorkouts,
      weekWorkouts,
      races,
      executionSummaryByPlannedWorkoutId,
    ] = await Promise.all([
      ctx.db.get(draft.userId),
      ctx.db.get(plan.goalId),
      ctx.db
        .query("competitiveness")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", draft.userId))
        .unique(),
      ctx.db
        .query("runningSchedules")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", draft.userId))
        .unique(),
      ctx.db
        .query("personalities")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", draft.userId))
        .unique(),
      ctx.db
        .query("healthKitWorkouts")
        .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", draft.userId))
        .collect(),
      ctx.db.query("workouts").withIndex("by_week_id", (queryBuilder) => queryBuilder.eq("weekId", week._id)).collect(),
      ctx.db.query("races").withIndex("by_plan_id", (queryBuilder) => queryBuilder.eq("planId", plan._id)).collect(),
      listExecutionSummariesByPlannedWorkoutId(ctx, draft.userId),
    ]);

    if (!user || !goal) {
      return null;
    }

    const availabilityOverride = normalizeAvailabilityOverride(week.availabilityOverride);
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

    const messages = buildWeekDetailGenerationMessages({
      goalLabel: goal.label,
      volumeMode: plan.volumeMode,
      peakWeekVolume: plan.peakWeekVolume,
      currentVDOT: user.currentVDOT,
      competitiveness: competitiveness?.level ?? "balanced",
      personalityDescription: personality?.description ?? "Direct and concise coaching.",
      preferredRunningDays: effectivePreferredRunningDays(runningSchedule, availabilityOverride),
      preferredLongRunDay: runningSchedule?.preferredLongRunDay ?? undefined,
      preferredQualityDays: runningSchedule?.preferredQualityDays ?? [],
      trackAccess: user.trackAccess,
      weekNumber: week.weekNumber,
      weekStartDateKey: week.weekStartDateKey as DateKey,
      weekEndDateKey: week.weekEndDateKey as DateKey,
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
      volumeTargetMode: resolveWeekVolumeTargetMode({
        availabilityOverride,
        interruptionType: week.interruptionType,
        racesInWeekCount: racesInWeek.length,
      }),
    });

    return {
      draft,
      promptPayload: String(messages[1]?.content ?? ""),
      personalityDescription: personality?.description ?? "Direct and concise coaching.",
      currentDraftObject: draft.latestObject ?? null,
    };
  },
});

export const generatePlanDraftArtifacts = internalAction({
  args: {
    draftId: v.id("agentPlanDrafts"),
    promptMessageId: v.string(),
  },
  handler: async (ctx, args): Promise<{
    assistantText: string;
    assistantMessageId: string | undefined;
    promptMessageId: string;
    object: unknown | null;
    objectError: string | undefined;
    metadata: { finishReason: string | undefined };
  }> => {
    const context = await ctx.runQuery(internal.planningInternal.getPlanDraftGenerationContext, {
      draftId: args.draftId,
    });
    if (!context) {
      throw new Error("Plan draft context could not be loaded.");
    }

    const { thread } = await planBuilderAgent.continueThread(ctx, {
      threadId: context.draft.threadId,
      userId: String(context.draft.userId),
    });
    const supplementalMessage = buildPlanConversationSupportMessage({
      promptPayload: context.promptPayload,
      currentDraftObject: context.currentDraftObject,
    });

    let object: unknown | null = null;
    let objectError: string | undefined;
    try {
      const objectResult = await thread.generateObject(
        {
          promptMessageId: args.promptMessageId,
          system: "Generate the current structured plan draft. Stay faithful to the conversation and the supplied structured context.",
          messages: [{ role: "user", content: supplementalMessage }],
          schema: planDraftSchema,
        },
        {
          storageOptions: {
            saveMessages: "none",
          },
        },
      );
      object = objectResult.object;
    } catch (error) {
      objectError = describeAiError(error);
      console.error("Plan draft structured generation failed", {
        draftId: args.draftId,
        promptMessageId: args.promptMessageId,
        error: objectError,
      });
    }

    const textResult = await thread.generateText({
      promptMessageId: args.promptMessageId,
      system: `${buildPlanBuilderInstructions()} Personality voice guidance: ${context.personalityDescription}. Competitiveness: ${context.competitiveness}.`,
      messages: [{ role: "user", content: supplementalMessage }],
    });

    return {
      assistantText: textResult.text,
      assistantMessageId: textResult.savedMessages.at(-1)?._id,
      promptMessageId: args.promptMessageId,
      object,
      objectError,
      metadata: {
        finishReason: textResult.finishReason,
      },
    };
  },
});

export const persistPlanDraftArtifacts = internalMutation({
  args: {
    draftId: v.id("agentPlanDrafts"),
    assistantText: v.string(),
    assistantMessageId: v.optional(v.string()),
    promptMessageId: v.string(),
    object: v.optional(v.any()),
    objectError: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.draftId);
    if (!draft) {
      return null;
    }

    const now = Date.now();
    if (args.objectError || typeof args.object === "undefined") {
      await ctx.db.patch(draft._id, {
        latestPreviewText: args.assistantText,
        validationStatus: "invalid",
        latestError: args.objectError ?? "Structured plan draft generation failed.",
        latestAssistantMessageId: args.assistantMessageId,
        latestPromptMessageId: args.promptMessageId,
        version: draft.version + 1,
        metadata: args.metadata,
        updatedAt: now,
      });
      return { ok: false };
    }
    try {
      const parsed = planDraftSchema.parse(args.object);
      const validated = validatePlanGenerationResponse(parsed, {
        goalType: draft.goalType,
        volumeMode: draft.volumeMode,
        authoritativeNumberOfWeeks: draft.authoritativeNumberOfWeeks,
      });

      await ctx.db.patch(draft._id, {
        latestObject: validated.proposal,
        latestPreviewText: args.assistantText,
        validationStatus: "valid",
        latestError: undefined,
        latestAssistantMessageId: args.assistantMessageId,
        latestPromptMessageId: args.promptMessageId,
        version: draft.version + 1,
        metadata: args.metadata,
        updatedAt: now,
      });
      return { ok: true };
    } catch (error) {
      await ctx.db.patch(draft._id, {
        latestPreviewText: args.assistantText,
        validationStatus: "invalid",
        latestError: describeAiError(error),
        latestAssistantMessageId: args.assistantMessageId,
        latestPromptMessageId: args.promptMessageId,
        version: draft.version + 1,
        metadata: args.metadata,
        updatedAt: now,
      });
      return { ok: false };
    }
  },
});

export const generateWeekDraftArtifacts = internalAction({
  args: {
    weekDraftId: v.id("agentWeekDrafts"),
    promptMessageId: v.string(),
  },
  handler: async (ctx, args): Promise<{
    assistantText: string;
    assistantMessageId: string | undefined;
    promptMessageId: string;
    object: unknown | null;
    objectError: string | undefined;
    metadata: { finishReason: string | undefined };
  }> => {
    const context = await ctx.runQuery(internal.planningInternal.getWeekDraftGenerationContext, {
      weekDraftId: args.weekDraftId,
    });
    if (!context) {
      throw new Error("Week draft context could not be loaded.");
    }

    const { thread } = await weekBuilderAgent.continueThread(ctx, {
      threadId: context.draft.threadId,
      userId: String(context.draft.userId),
    });
    const supplementalMessage = buildWeekConversationSupportMessage({
      promptPayload: context.promptPayload,
      currentDraftObject: context.currentDraftObject,
    });

    let object: unknown | null = null;
    let objectError: string | undefined;
    try {
      const objectResult = await thread.generateObject(
        {
          promptMessageId: args.promptMessageId,
          system: "Generate the current structured week draft. Stay faithful to the conversation and the supplied structured context.",
          messages: [{ role: "user", content: supplementalMessage }],
          schema: weekDraftSchema,
        },
        {
          storageOptions: {
            saveMessages: "none",
          },
        },
      );
      object = objectResult.object;
    } catch (error) {
      objectError = describeAiError(error);
      console.error("Week draft structured generation failed", {
        weekDraftId: args.weekDraftId,
        promptMessageId: args.promptMessageId,
        error: objectError,
      });
    }

    const textResult = await thread.generateText({
      promptMessageId: args.promptMessageId,
      system: `${buildWeekBuilderInstructions()} Personality voice guidance: ${context.personalityDescription}.`,
      messages: [{ role: "user", content: supplementalMessage }],
    });

    return {
      assistantText: textResult.text,
      assistantMessageId: textResult.savedMessages.at(-1)?._id,
      promptMessageId: args.promptMessageId,
      object,
      objectError,
      metadata: {
        finishReason: textResult.finishReason,
      },
    };
  },
});

export const persistWeekDraftArtifacts = internalMutation({
  args: {
    weekDraftId: v.id("agentWeekDrafts"),
    assistantText: v.string(),
    assistantMessageId: v.optional(v.string()),
    promptMessageId: v.string(),
    object: v.optional(v.any()),
    objectError: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.weekDraftId);
    if (!draft) {
      return null;
    }
    const [plan, week] = await Promise.all([ctx.db.get(draft.planId), ctx.db.get(draft.weekId)]);
    if (!plan || !week) {
      return null;
    }

    const now = Date.now();
    if (args.objectError || typeof args.object === "undefined") {
      await ctx.db.patch(draft._id, {
        latestPreviewText: args.assistantText,
        validationStatus: "invalid",
        latestError: args.objectError ?? "Structured week draft generation failed.",
        latestAssistantMessageId: args.assistantMessageId,
        latestPromptMessageId: args.promptMessageId,
        version: draft.version + 1,
        metadata: args.metadata,
        updatedAt: now,
      });
      return { ok: false };
    }
    try {
      const parsed = weekDraftSchema.parse(args.object);
      const [runningSchedule, existingWorkouts, executionSummaryByPlannedWorkoutId, racesInPlan, user] =
        await Promise.all([
          ctx.db
            .query("runningSchedules")
            .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", draft.userId))
            .unique(),
          ctx.db.query("workouts").withIndex("by_week_id", (queryBuilder) => queryBuilder.eq("weekId", week._id)).collect(),
          listExecutionSummariesByPlannedWorkoutId(ctx, draft.userId),
          ctx.db.query("races").withIndex("by_plan_id", (queryBuilder) => queryBuilder.eq("planId", plan._id)).collect(),
          ctx.db.get(draft.userId),
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

      const validated = validateWeekDetailResponse(parsed, {
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

      await ctx.db.patch(draft._id, {
        latestObject: validated.proposal,
        latestPreviewText: args.assistantText,
        validationStatus: "valid",
        latestError: undefined,
        latestAssistantMessageId: args.assistantMessageId,
        latestPromptMessageId: args.promptMessageId,
        version: draft.version + 1,
        metadata: args.metadata,
        updatedAt: now,
      });
      return { ok: true };
    } catch (error) {
      await ctx.db.patch(draft._id, {
        latestPreviewText: args.assistantText,
        validationStatus: "invalid",
        latestError: describeAiError(error),
        latestAssistantMessageId: args.assistantMessageId,
        latestPromptMessageId: args.promptMessageId,
        version: draft.version + 1,
        metadata: args.metadata,
        updatedAt: now,
      });
      return { ok: false };
    }
  },
});

export const runPlanDraftUpdateWorkflow = workflow.define({
  args: {
    draftId: v.id("agentPlanDrafts"),
    promptMessageId: v.string(),
  },
  handler: async (step, args) => {
    const generated = await step.runAction(internal.planningInternal.generatePlanDraftArtifacts, args, {
      retry: true,
    });
    await step.runMutation(internal.planningInternal.persistPlanDraftArtifacts, {
      draftId: args.draftId,
      assistantText: generated.assistantText,
      assistantMessageId: generated.assistantMessageId,
      promptMessageId: generated.promptMessageId,
      object: generated.object,
      objectError: generated.objectError,
      metadata: generated.metadata,
    });
  },
});

export const runWeekDraftUpdateWorkflow = workflow.define({
  args: {
    weekDraftId: v.id("agentWeekDrafts"),
    promptMessageId: v.string(),
  },
  handler: async (step, args) => {
    const generated = await step.runAction(internal.planningInternal.generateWeekDraftArtifacts, args, {
      retry: true,
    });
    await step.runMutation(internal.planningInternal.persistWeekDraftArtifacts, {
      weekDraftId: args.weekDraftId,
      assistantText: generated.assistantText,
      assistantMessageId: generated.assistantMessageId,
      promptMessageId: generated.promptMessageId,
      object: generated.object,
      objectError: generated.objectError,
      metadata: generated.metadata,
    });
  },
});
