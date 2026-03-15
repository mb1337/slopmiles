import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type HistorySummarySnapshot = {
  matched: number;
  needsReview: number;
  unplanned: number;
  total: number;
  lastImportedAt: number | null;
};

type HistoryWorkoutRecord = Pick<Doc<"healthKitWorkouts">, "historyStatus" | "importedAt">;
type HistorySummaryDoc = Doc<"historySummaries">;
type HistoryStatus = "matched" | "needsReview" | "unplanned";

const EMPTY_HISTORY_SUMMARY: HistorySummarySnapshot = {
  matched: 0,
  needsReview: 0,
  unplanned: 0,
  total: 0,
  lastImportedAt: null,
};

function normalizeHistoryStatus(
  status: Doc<"healthKitWorkouts">["historyStatus"] | null | undefined,
): HistoryStatus {
  if (status === "matched" || status === "needsReview") {
    return status;
  }

  return "unplanned";
}

function snapshotFromSummary(summary: HistorySummaryDoc): HistorySummarySnapshot {
  return {
    matched: summary.matchedCount,
    needsReview: summary.needsReviewCount,
    unplanned: summary.unplannedCount,
    total: summary.totalCount,
    lastImportedAt: summary.lastImportedAt ?? null,
  };
}

function summaryPatchFromSnapshot(snapshot: HistorySummarySnapshot, now: number) {
  return {
    matchedCount: snapshot.matched,
    needsReviewCount: snapshot.needsReview,
    unplannedCount: snapshot.unplanned,
    totalCount: snapshot.total,
    lastImportedAt: snapshot.lastImportedAt ?? undefined,
    updatedAt: now,
  };
}

function applyWorkoutToSnapshot(snapshot: HistorySummarySnapshot, workout: HistoryWorkoutRecord) {
  const status = normalizeHistoryStatus(workout.historyStatus);
  snapshot.total += 1;
  if (status === "matched") {
    snapshot.matched += 1;
  } else if (status === "needsReview") {
    snapshot.needsReview += 1;
  } else {
    snapshot.unplanned += 1;
  }

  if (snapshot.lastImportedAt === null || workout.importedAt > snapshot.lastImportedAt) {
    snapshot.lastImportedAt = workout.importedAt;
  }
}

async function buildSnapshotFromWorkouts(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<HistorySummarySnapshot> {
  const workouts = await ctx.db
    .query("healthKitWorkouts")
    .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
    .collect();

  const snapshot: HistorySummarySnapshot = { ...EMPTY_HISTORY_SUMMARY };
  for (const workout of workouts) {
    applyWorkoutToSnapshot(snapshot, workout);
  }

  return snapshot;
}

export async function getHistorySummarySnapshot(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<HistorySummarySnapshot> {
  const summary = await ctx.db
    .query("historySummaries")
    .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
    .unique();

  if (summary) {
    return snapshotFromSummary(summary);
  }

  return await buildSnapshotFromWorkouts(ctx, userId);
}

export async function syncHistorySummaryAfterWorkoutMutation(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    previousWorkout: HistoryWorkoutRecord | null;
    nextWorkout: HistoryWorkoutRecord | null;
  },
): Promise<void> {
  const summary = await ctx.db
    .query("historySummaries")
    .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", args.userId))
    .unique();

  if (!summary) {
    const snapshot = await buildSnapshotFromWorkouts(ctx, args.userId);
    await ctx.db.insert("historySummaries", {
      userId: args.userId,
      ...summaryPatchFromSnapshot(snapshot, Date.now()),
    });
    return;
  }

  let nextSnapshot = snapshotFromSummary(summary);

  if (args.previousWorkout) {
    const previousStatus = normalizeHistoryStatus(args.previousWorkout.historyStatus);
    nextSnapshot = {
      ...nextSnapshot,
      matched: nextSnapshot.matched - (previousStatus === "matched" ? 1 : 0),
      needsReview: nextSnapshot.needsReview - (previousStatus === "needsReview" ? 1 : 0),
      unplanned: nextSnapshot.unplanned - (previousStatus === "unplanned" ? 1 : 0),
      total: nextSnapshot.total - 1,
    };
  }

  if (args.nextWorkout) {
    const nextStatus = normalizeHistoryStatus(args.nextWorkout.historyStatus);
    nextSnapshot = {
      ...nextSnapshot,
      matched: nextSnapshot.matched + (nextStatus === "matched" ? 1 : 0),
      needsReview: nextSnapshot.needsReview + (nextStatus === "needsReview" ? 1 : 0),
      unplanned: nextSnapshot.unplanned + (nextStatus === "unplanned" ? 1 : 0),
      total: nextSnapshot.total + 1,
      lastImportedAt:
        nextSnapshot.lastImportedAt === null || args.nextWorkout.importedAt > nextSnapshot.lastImportedAt
          ? args.nextWorkout.importedAt
          : nextSnapshot.lastImportedAt,
    };
  }

  if (nextSnapshot.total <= 0) {
    nextSnapshot = { ...EMPTY_HISTORY_SUMMARY };
  } else if (
    args.nextWorkout === null &&
    args.previousWorkout !== null &&
    summary.lastImportedAt !== undefined &&
    args.previousWorkout.importedAt === summary.lastImportedAt
  ) {
    nextSnapshot = await buildSnapshotFromWorkouts(ctx, args.userId);
  }

  await ctx.db.patch(summary._id, summaryPatchFromSnapshot(nextSnapshot, Date.now()));
}

export async function resetHistorySummary(ctx: MutationCtx, userId: Id<"users">): Promise<void> {
  const summary = await ctx.db
    .query("historySummaries")
    .withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId))
    .unique();

  if (summary) {
    await ctx.db.patch(summary._id, summaryPatchFromSnapshot(EMPTY_HISTORY_SUMMARY, Date.now()));
    return;
  }

  await ctx.db.insert("historySummaries", {
    userId,
    ...summaryPatchFromSnapshot(EMPTY_HISTORY_SUMMARY, Date.now()),
  });
}
