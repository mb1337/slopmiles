import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { historyWorkoutStatusFromExecution } from "./workoutExecutionHelpers";

async function requireAuthenticatedUserId(ctx: QueryCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Authentication required.");
  }

  return userId;
}

export const getFeedCounts = query({
  args: {},
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

export const listFeedPage = query({
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
