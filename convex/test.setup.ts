import { convexTest } from "convex-test";
import type { GenericSchema, SchemaDefinition } from "convex/server";

import schema from "./schema";
import type { Doc, Id } from "./_generated/dataModel";

type ConvexModuleLoader = () => Promise<unknown>;
type ImportMetaWithGlob = ImportMeta & {
  glob: <T = unknown>(
    pattern: string,
    options?: {
      eager?: boolean;
    },
  ) => Record<string, T | ConvexModuleLoader>;
};

const allModules = (import.meta as ImportMetaWithGlob).glob<ConvexModuleLoader>("./**/*.ts");
const workflowModules = (import.meta as ImportMetaWithGlob).glob<ConvexModuleLoader>(
  "../node_modules/@convex-dev/workflow/dist/component/**/*.js",
);
const workflowSchemaModule = Object.values(
  (import.meta as ImportMetaWithGlob).glob<{ default: SchemaDefinition<GenericSchema, boolean> }>(
    "../node_modules/@convex-dev/workflow/dist/component/schema.js",
    { eager: true },
  ),
)[0] as { default: SchemaDefinition<GenericSchema, boolean> } | undefined;
const workpoolModules = (import.meta as ImportMetaWithGlob).glob<ConvexModuleLoader>(
  "../node_modules/.pnpm/@convex-dev+workpool@*/node_modules/@convex-dev/workpool/dist/component/**/*.js",
);
const workpoolSchemaModule = Object.values(
  (import.meta as ImportMetaWithGlob).glob<{ default: SchemaDefinition<GenericSchema, boolean> }>(
    "../node_modules/.pnpm/@convex-dev+workpool@*/node_modules/@convex-dev/workpool/dist/component/schema.js",
    { eager: true },
  ),
)[0] as { default: SchemaDefinition<GenericSchema, boolean> } | undefined;
const modules: Record<string, ConvexModuleLoader> = Object.fromEntries(
  Object.entries(allModules).filter(([path]) => {
    return (
      !path.endsWith(".test.ts") &&
      !path.endsWith(".integration.test.ts") &&
      !path.endsWith("/test.setup.ts")
    );
  }),
);

type InsertableUser = Omit<Doc<"users">, "_id" | "_creationTime">;
type SlopMilesTestConvex = ReturnType<typeof createConvexTest>;
const globalWorkflowFlags = globalThis as typeof globalThis & {
  __SLOPMILES_DISABLE_WORKFLOWS__?: boolean;
};

let nextUserNumber = 1;
globalWorkflowFlags.__SLOPMILES_DISABLE_WORKFLOWS__ = true;

export function createConvexTest() {
  const t = convexTest(schema, modules);
  if (!workflowSchemaModule?.default || !workpoolSchemaModule?.default) {
    throw new Error("Workflow test components could not be loaded.");
  }
  t.registerComponent("workflow", workflowSchemaModule.default, workflowModules);
  t.registerComponent("workflow/workpool", workpoolSchemaModule.default, workpoolModules);
  return t;
}

export async function createTestUser(
  t: SlopMilesTestConvex,
  overrides: Partial<InsertableUser> = {},
) {
  const now = Date.now();
  const userNumber = nextUserNumber++;
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      appleSubject: undefined,
      appleDefaultName: "Runner",
      name: "Runner",
      image: undefined,
      email: `runner${userNumber}@example.com`,
      emailVerificationTime: now,
      phone: undefined,
      phoneVerificationTime: undefined,
      isAnonymous: false,
      unitPreference: "system",
      volumePreference: "time",
      trackAccess: false,
      healthKitAuthorized: false,
      strengthTrainingEnabled: false,
      strengthEquipment: [],
      currentVDOT: undefined,
      maxHeartRate: undefined,
      restingHeartRate: undefined,
      healthKitLastSyncAt: undefined,
      healthKitLastSyncSource: undefined,
      healthKitLastSyncError: undefined,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    });
  });

  const user = await getUser(t, userId);
  if (!user) {
    throw new Error("Failed to load created test user.");
  }
  return user;
}

export function asAuthenticatedUser(t: SlopMilesTestConvex, userId: Id<"users">) {
  return t.withIdentity({
    subject: userId,
    tokenIdentifier: `${userId}:test`,
  });
}

export async function getUser(t: SlopMilesTestConvex, userId: Id<"users">) {
  return await t.run(async (ctx) => await ctx.db.get(userId));
}

export async function getRunningScheduleForUser(t: SlopMilesTestConvex, userId: Id<"users">) {
  return await t.run(async (ctx) => {
    return await ctx.db
      .query("runningSchedules")
      .withIndex("by_user_id", (query) => query.eq("userId", userId))
      .unique();
  });
}

export async function getOnboardingStateForUser(t: SlopMilesTestConvex, userId: Id<"users">) {
  return await t.run(async (ctx) => {
    return await ctx.db
      .query("onboardingStates")
      .withIndex("by_user_id", (query) => query.eq("userId", userId))
      .unique();
  });
}

export async function getCompetitivenessForUser(t: SlopMilesTestConvex, userId: Id<"users">) {
  return await t.run(async (ctx) => {
    return await ctx.db
      .query("competitiveness")
      .withIndex("by_user_id", (query) => query.eq("userId", userId))
      .unique();
  });
}

export async function getPersonalityForUser(t: SlopMilesTestConvex, userId: Id<"users">) {
  return await t.run(async (ctx) => {
    return await ctx.db
      .query("personalities")
      .withIndex("by_user_id", (query) => query.eq("userId", userId))
      .unique();
  });
}

export async function getPlansForUser(t: SlopMilesTestConvex, userId: Id<"users">) {
  return await t.run(async (ctx) => {
    return await ctx.db
      .query("trainingPlans")
      .withIndex("by_user_id", (query) => query.eq("userId", userId))
      .collect();
  });
}

export async function getGoalsForUser(t: SlopMilesTestConvex, userId: Id<"users">) {
  return await t.run(async (ctx) => {
    return await ctx.db
      .query("goals")
      .withIndex("by_user_id", (query) => query.eq("userId", userId))
      .collect();
  });
}

export async function getTrainingWeeksForPlan(
  t: SlopMilesTestConvex,
  planId: Id<"trainingPlans">,
) {
  return await t.run(async (ctx) => {
    return await ctx.db
      .query("trainingWeeks")
      .withIndex("by_plan_id", (query) => query.eq("planId", planId))
      .collect();
  });
}

export async function getCoachMessagesForUser(t: SlopMilesTestConvex, userId: Id<"users">) {
  return await t.run(async (ctx) => {
    return await ctx.db
      .query("coachMessages")
      .withIndex("by_user_id", (query) => query.eq("userId", userId))
      .collect();
  });
}

export async function getAiRequestsForUser(t: SlopMilesTestConvex, userId: Id<"users">) {
  return await t.run(async (ctx) => {
    return await ctx.db
      .query("aiRequests")
      .withIndex("by_user_id", (query) => query.eq("userId", userId))
      .collect();
  });
}
