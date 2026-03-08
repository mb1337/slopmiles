import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, type MutationCtx } from "./_generated/server";

import {
  competitivenessLevels,
  personalityPresets,
  strengthEquipmentOptions,
  unitPreferences,
  volumeModes,
  weekdays,
  type StrengthEquipment,
  type Weekday,
} from "./constants";

const unitPreferenceValidator = v.union(...unitPreferences.map((unit) => v.literal(unit)));
const volumeModeValidator = v.union(...volumeModes.map((mode) => v.literal(mode)));
const strengthEquipmentValidator = v.union(...strengthEquipmentOptions.map((item) => v.literal(item)));
const weekdayValidator = v.union(...weekdays.map((day) => v.literal(day)));
const competitivenessValidator = v.union(...competitivenessLevels.map((level) => v.literal(level)));
const personalityPresetValidator = v.union(...personalityPresets.map((preset) => v.literal(preset)));

const DEFAULT_DAYS: Weekday[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

async function requireAuthenticatedUserId(ctx: MutationCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Authentication required.");
  }
  return userId;
}

function isValidClockText(value: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return false;
  }

  const [hoursText, minutesText] = value.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  return Number.isInteger(hours) && Number.isInteger(minutes) && hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function sanitizeWeekdays(days: Weekday[]): Weekday[] {
  const seen = new Set<Weekday>();
  const ordered: Weekday[] = [];

  for (const day of days) {
    if (seen.has(day)) {
      continue;
    }
    seen.add(day);
    ordered.push(day);
  }

  return ordered;
}

function sanitizeAvailabilityWindows(
  value: unknown,
  allowedDays: Weekday[],
): Partial<Record<Weekday, Array<{ start: string; end: string }>>> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const allowed = new Set<Weekday>(allowedDays);
  const windows = value as Record<string, unknown>;
  const sanitized: Partial<Record<Weekday, Array<{ start: string; end: string }>>> = {};

  for (const [day, entries] of Object.entries(windows)) {
    if (!allowed.has(day as Weekday)) {
      continue;
    }

    if (!Array.isArray(entries)) {
      throw new Error(`Availability windows for ${day} must be a list.`);
    }

    const normalizedEntries: Array<{ start: string; end: string }> = [];
    for (const entry of entries) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new Error(`Availability windows for ${day} must be objects.`);
      }

      const candidate = entry as { start?: unknown; end?: unknown };
      if (typeof candidate.start !== "string" || typeof candidate.end !== "string") {
        throw new Error(`Availability windows for ${day} require start and end times.`);
      }

      if (!isValidClockText(candidate.start) || !isValidClockText(candidate.end)) {
        throw new Error(`Availability windows for ${day} must use HH:MM format.`);
      }

      if (candidate.start >= candidate.end) {
        throw new Error(`Availability windows for ${day} must end after they start.`);
      }

      normalizedEntries.push({
        start: candidate.start,
        end: candidate.end,
      });
    }

    if (normalizedEntries.length > 0) {
      normalizedEntries.sort((left, right) => left.start.localeCompare(right.start));
      sanitized[day as Weekday] = normalizedEntries;
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

async function insertCoachEvent(
  ctx: MutationCtx,
  userId: Id<"users">,
  body: string,
  planId?: Id<"trainingPlans">,
) {
  await ctx.db.insert("coachMessages", {
    userId,
    author: "coach",
    kind: "event",
    body,
    planId,
    createdAt: Date.now(),
  });
}

async function ensureRunningSchedule(ctx: MutationCtx, userId: Id<"users">, now: number) {
  let runningSchedule = await ctx.db
    .query("runningSchedules")
    .withIndex("by_user_id", (query) => query.eq("userId", userId))
    .unique();

  if (!runningSchedule) {
    const scheduleId = await ctx.db.insert("runningSchedules", {
      userId,
      preferredRunningDays: DEFAULT_DAYS,
      runningDaysPerWeek: 5,
      preferredQualityDays: ["tuesday", "thursday"],
      updatedAt: now,
    });
    runningSchedule = await ctx.db.get(scheduleId);
  }

  if (!runningSchedule) {
    throw new Error("Failed to initialize running schedule");
  }

  return runningSchedule;
}

async function ensureOnboardingState(ctx: MutationCtx, userId: Id<"users">, now: number) {
  let onboardingState = await ctx.db
    .query("onboardingStates")
    .withIndex("by_user_id", (query) => query.eq("userId", userId))
    .unique();

  if (!onboardingState) {
    const stateId = await ctx.db.insert("onboardingStates", {
      userId,
      currentStep: "welcome",
      isComplete: false,
      updatedAt: now,
    });
    onboardingState = await ctx.db.get(stateId);
  }

  if (!onboardingState) {
    throw new Error("Failed to initialize onboarding state");
  }

  return onboardingState;
}

async function ensureCompetitiveness(ctx: MutationCtx, userId: Id<"users">, now: number) {
  let competitiveness = await ctx.db
    .query("competitiveness")
    .withIndex("by_user_id", (query) => query.eq("userId", userId))
    .unique();

  if (!competitiveness) {
    const competitivenessId = await ctx.db.insert("competitiveness", {
      userId,
      level: "balanced",
      updatedAt: now,
    });
    competitiveness = await ctx.db.get(competitivenessId);
  }

  if (!competitiveness) {
    throw new Error("Failed to initialize competitiveness");
  }

  return competitiveness;
}

async function ensurePersonality(ctx: MutationCtx, userId: Id<"users">, now: number) {
  let personality = await ctx.db
    .query("personalities")
    .withIndex("by_user_id", (query) => query.eq("userId", userId))
    .unique();

  if (!personality) {
    const personalityId = await ctx.db.insert("personalities", {
      userId,
      name: "noNonsense",
      isPreset: true,
      description: "Brief, direct, no fluff.",
      updatedAt: now,
    });
    personality = await ctx.db.get(personalityId);
  }

  if (!personality) {
    throw new Error("Failed to initialize personality");
  }

  return personality;
}

export const bootstrapSession = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    const user = await ctx.db.get(userId);

    if (!user) {
      return null;
    }

    const runningSchedule = await ensureRunningSchedule(ctx, userId, now);
    const onboardingState = await ensureOnboardingState(ctx, userId, now);
    const competitiveness = await ensureCompetitiveness(ctx, userId, now);
    const personality = await ensurePersonality(ctx, userId, now);

    return {
      user,
      runningSchedule,
      onboardingState,
      competitiveness,
      personality,
    };
  },
});

export const resetAppData = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("User not found.");
    }

    const appleDefaultName = user.appleDefaultName?.trim();
    const currentName = user.name.trim();
    const fallbackName = currentName.length > 0 && currentName.toLowerCase() !== "runner" ? currentName : "Runner";
    const resetName = appleDefaultName && appleDefaultName.length > 0 ? appleDefaultName : fallbackName;

    const plans = await ctx.db
      .query("trainingPlans")
      .withIndex("by_user_id", (query) => query.eq("userId", userId))
      .collect();
    for (const plan of plans) {
      await ctx.db.delete(plan._id);
    }

    const goals = await ctx.db
      .query("goals")
      .withIndex("by_user_id", (query) => query.eq("userId", userId))
      .collect();
    for (const goal of goals) {
      await ctx.db.delete(goal._id);
    }

    const schedules = await ctx.db
      .query("runningSchedules")
      .withIndex("by_user_id", (query) => query.eq("userId", userId))
      .collect();
    for (const schedule of schedules) {
      await ctx.db.delete(schedule._id);
    }

    const onboardingStates = await ctx.db
      .query("onboardingStates")
      .withIndex("by_user_id", (query) => query.eq("userId", userId))
      .collect();
    for (const onboardingState of onboardingStates) {
      await ctx.db.delete(onboardingState._id);
    }

    const competitivenessRows = await ctx.db
      .query("competitiveness")
      .withIndex("by_user_id", (query) => query.eq("userId", userId))
      .collect();
    for (const competitiveness of competitivenessRows) {
      await ctx.db.delete(competitiveness._id);
    }

    const personalities = await ctx.db
      .query("personalities")
      .withIndex("by_user_id", (query) => query.eq("userId", userId))
      .collect();
    for (const personality of personalities) {
      await ctx.db.delete(personality._id);
    }

    const healthKitWorkouts = await ctx.db
      .query("healthKitWorkouts")
      .withIndex("by_user_id", (query) => query.eq("userId", userId))
      .collect();
    for (const workout of healthKitWorkouts) {
      await ctx.db.delete(workout._id);
    }

    const aiRequests = await ctx.db
      .query("aiRequests")
      .withIndex("by_user_id", (query) => query.eq("userId", userId))
      .collect();
    for (const aiRequest of aiRequests) {
      await ctx.db.delete(aiRequest._id);
    }

    const aiDiagnostics = await ctx.db
      .query("aiDiagnostics")
      .withIndex("by_user_id", (query) => query.eq("userId", userId))
      .collect();
    for (const aiDiagnostic of aiDiagnostics) {
      await ctx.db.delete(aiDiagnostic._id);
    }

    const coachMessages = await ctx.db
      .query("coachMessages")
      .withIndex("by_user_id", (query) => query.eq("userId", userId))
      .collect();
    for (const coachMessage of coachMessages) {
      await ctx.db.delete(coachMessage._id);
    }

    for (const table of ["strengthWorkouts", "courses", "races", "peakVolumeChanges", "goalChanges", "planAssessments"] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_user_id", (query) => query.eq("userId", userId))
        .collect();
      for (const row of rows) {
        await ctx.db.delete(row._id);
      }
    }

    const now = Date.now();
    await ctx.db.patch(userId, {
      name: resetName,
      appleDefaultName: appleDefaultName && appleDefaultName.length > 0 ? appleDefaultName : undefined,
      unitPreference: "system",
      volumePreference: "time",
      trackAccess: false,
      healthKitAuthorized: false,
      strengthTrainingEnabled: false,
      strengthEquipment: [],
      currentVDOT: undefined,
      maxHeartRate: undefined,
      restingHeartRate: undefined,
      updatedAt: now,
    });

    await ensureRunningSchedule(ctx, userId, now);
    await ensureOnboardingState(ctx, userId, now);
    await ensureCompetitiveness(ctx, userId, now);
    await ensurePersonality(ctx, userId, now);
  },
});

export const updateUnitPreference = mutation({
  args: {
    unitPreference: unitPreferenceValidator,
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    await ctx.db.patch(userId, {
      unitPreference: args.unitPreference,
      updatedAt: Date.now(),
    });
  },
});

export const updateVolumePreference = mutation({
  args: {
    volumePreference: volumeModeValidator,
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    await ctx.db.patch(userId, {
      volumePreference: args.volumePreference,
      updatedAt: Date.now(),
    });

    await insertCoachEvent(
      ctx,
      userId,
      `Volume mode updated to ${args.volumePreference === "time" ? "time-based" : "distance-based"} planning.`,
    );
  },
});

export const updateTrackAccess = mutation({
  args: {
    trackAccess: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    await ctx.db.patch(userId, {
      trackAccess: args.trackAccess,
      updatedAt: Date.now(),
    });

    await insertCoachEvent(
      ctx,
      userId,
      args.trackAccess
        ? "Track access is enabled. Faster sessions can use track-native distances."
        : "Track access is disabled. Faster sessions should bias toward time-based equivalents.",
    );
  },
});

function sanitizeStrengthEquipment(equipment: StrengthEquipment[]): StrengthEquipment[] {
  const seen = new Set<StrengthEquipment>();
  const ordered: StrengthEquipment[] = [];

  for (const item of equipment) {
    if (seen.has(item)) {
      continue;
    }
    seen.add(item);
    ordered.push(item);
  }

  return ordered;
}

export const updateStrengthPreferences = mutation({
  args: {
    enabled: v.boolean(),
    equipment: v.array(strengthEquipmentValidator),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const equipment = sanitizeStrengthEquipment(args.equipment);

    await ctx.db.patch(userId, {
      strengthTrainingEnabled: args.enabled,
      strengthEquipment: equipment,
      updatedAt: Date.now(),
    });

    await insertCoachEvent(
      ctx,
      userId,
      args.enabled
        ? `Strength training enabled with ${equipment.length > 0 ? equipment.join(", ") : "bodyweight-only"} equipment.`
        : "Strength training disabled for future planning.",
      undefined,
    );
  },
});

export const updateRunningSchedule = mutation({
  args: {
    preferredRunningDays: v.array(weekdayValidator),
    runningDaysPerWeek: v.number(),
    preferredLongRunDay: v.optional(weekdayValidator),
    preferredQualityDays: v.array(weekdayValidator),
    availabilityWindows: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const preferredRunningDays = sanitizeWeekdays(args.preferredRunningDays);

    if (preferredRunningDays.length === 0) {
      throw new Error("At least one preferred running day is required.");
    }

    const runningDaysPerWeek = Math.round(args.runningDaysPerWeek);
    if (runningDaysPerWeek < 1 || runningDaysPerWeek > preferredRunningDays.length) {
      throw new Error("Running days per week must be between 1 and the number of available days.");
    }

    if (args.preferredLongRunDay && !preferredRunningDays.includes(args.preferredLongRunDay)) {
      throw new Error("Preferred long run day must be one of the preferred running days.");
    }

    const preferredQualityDays = sanitizeWeekdays(args.preferredQualityDays).filter((day) =>
      preferredRunningDays.includes(day),
    );
    const availabilityWindows = sanitizeAvailabilityWindows(args.availabilityWindows, preferredRunningDays);

    const schedule = await ensureRunningSchedule(ctx, userId, Date.now());
    await ctx.db.patch(schedule._id, {
      preferredRunningDays,
      runningDaysPerWeek,
      preferredLongRunDay: args.preferredLongRunDay,
      preferredQualityDays,
      availabilityWindows,
      updatedAt: Date.now(),
    });

    await insertCoachEvent(
      ctx,
      userId,
      `Schedule updated: ${runningDaysPerWeek} run days per week across ${preferredRunningDays.join(", ")}.`,
    );
  },
});

export const updateCompetitiveness = mutation({
  args: {
    level: competitivenessValidator,
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const competitiveness = await ensureCompetitiveness(ctx, userId, Date.now());
    await ctx.db.patch(competitiveness._id, {
      level: args.level,
      updatedAt: Date.now(),
    });

    await insertCoachEvent(ctx, userId, `Competitiveness updated to ${args.level}.`);
  },
});

const presetDescriptions: Record<string, string> = {
  cheerleader: "High-energy and celebratory.",
  noNonsense: "Direct and concise coaching.",
  nerd: "Data-forward with science explanations.",
  zen: "Calm and process-focused guidance.",
  custom: "Custom coach voice.",
};

export const updatePersonality = mutation({
  args: {
    preset: personalityPresetValidator,
    customDescription: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const personality = await ensurePersonality(ctx, userId, Date.now());
    const isCustom = args.preset === "custom";
    const description = isCustom
      ? args.customDescription?.trim() || "Custom coach voice."
      : (presetDescriptions[args.preset] ?? "Custom coach voice.");

    await ctx.db.patch(personality._id, {
      name: args.preset,
      isPreset: !isCustom,
      description,
      updatedAt: Date.now(),
    });

    await insertCoachEvent(ctx, userId, `Coach personality updated to ${args.preset}.`);
  },
});

export const setAppleDefaultNameForUser = internalMutation({
  args: {
    userId: v.id("users"),
    appleDefaultName: v.string(),
  },
  handler: async (ctx, args) => {
    const normalized = args.appleDefaultName.trim();
    if (normalized.length === 0) {
      return;
    }

    const [firstName] = normalized.split(/\s+/);
    const fallbackName = firstName ?? normalized;
    const user = await ctx.db.get(args.userId);
    if (!user) {
      return;
    }

    const currentDefaultName = user.appleDefaultName?.trim();
    const shouldSetDefault =
      !currentDefaultName || currentDefaultName.length === 0 || currentDefaultName.toLowerCase() === "runner";
    const currentName = user.name.trim();
    const shouldSetUserName =
      (currentName.length === 0 || currentName.toLowerCase() === "runner") && fallbackName.toLowerCase() !== "runner";

    if (!shouldSetDefault && !shouldSetUserName) {
      return;
    }

    await ctx.db.patch(args.userId, {
      ...(shouldSetDefault ? { appleDefaultName: fallbackName } : {}),
      ...(shouldSetUserName ? { name: fallbackName } : {}),
      updatedAt: Date.now(),
    });
  },
});

export const updateName = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("User not found.");
    }

    const name = args.name.trim();

    if (name.length === 0) {
      throw new Error("Name cannot be empty.");
    }

    const updates: {
      name: string;
      updatedAt: number;
      appleDefaultName?: string;
    } = {
      name,
      updatedAt: Date.now(),
    };

    const previousName = user.name.trim();
    if (!user.appleDefaultName && previousName.length > 0 && previousName.toLowerCase() !== "runner") {
      updates.appleDefaultName = previousName;
    }

    await ctx.db.patch(userId, updates);
  },
});
