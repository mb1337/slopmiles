import {
  dateKeyFromEpochMs,
  endOfWeekSunday,
  startOfWeekMonday,
  weekNumberFromStart,
  type DateKey,
} from "../packages/domain/src/calendar";
import { resolvePercentOfPeakAbsoluteValue, roundPersistedAbsoluteValue } from "../packages/domain/src/index";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

export function resolveAbsoluteWeekVolume(
  volumeMode: "time" | "distance",
  peakWeekVolume: number,
  percentOfPeak: number,
): number {
  return roundPersistedAbsoluteValue(
    resolvePercentOfPeakAbsoluteValue(
      volumeMode === "time"
        ? {
            mode: "time",
            peakWeekVolumeMinutes: peakWeekVolume,
            percentOfPeak,
          }
        : {
            mode: "distance",
            peakWeekVolumeMeters: peakWeekVolume,
            percentOfPeak,
          },
    ),
  );
}

export function normalizeActivationDateKey(epochMs: number, canonicalTimeZoneId: string): DateKey {
  return startOfWeekMonday(dateKeyFromEpochMs(epochMs, canonicalTimeZoneId));
}

export function deriveCurrentWeekNumber(
  plan: Pick<Doc<"trainingPlans">, "startDateKey" | "numberOfWeeks" | "canonicalTimeZoneId">,
  now: number,
): number | null {
  if (!plan.startDateKey || !plan.canonicalTimeZoneId) {
    return null;
  }

  const currentDateKey = dateKeyFromEpochMs(now, plan.canonicalTimeZoneId);
  const weekNumber = weekNumberFromStart(plan.startDateKey as DateKey, currentDateKey);
  if (weekNumber < 1) {
    return 1;
  }
  if (weekNumber > plan.numberOfWeeks) {
    return plan.numberOfWeeks;
  }
  return weekNumber;
}

export function isWeekGeneratable(
  plan: Pick<Doc<"trainingPlans">, "startDateKey" | "numberOfWeeks" | "canonicalTimeZoneId">,
  weekNumber: number,
  now: number,
): boolean {
  const currentWeekNumber = deriveCurrentWeekNumber(plan, now);
  if (!currentWeekNumber) {
    return false;
  }
  return weekNumber === currentWeekNumber || weekNumber === currentWeekNumber + 1;
}

export async function listTrainingWeeks(
  ctx: QueryCtx,
  planId: Id<"trainingPlans">,
): Promise<Doc<"trainingWeeks">[]> {
  const weeks = await ctx.db
    .query("trainingWeeks")
    .withIndex("by_plan_id", (queryBuilder) => queryBuilder.eq("planId", planId))
    .collect();

  return weeks.sort((left, right) => left.weekNumber - right.weekNumber);
}

export function endDateFromStart(startDateKey: DateKey): DateKey {
  return endOfWeekSunday(startDateKey);
}
