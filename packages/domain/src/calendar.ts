const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type DateKey = `${number}-${string}-${string}`;

export type CalendarDateParts = {
  year: number;
  month: number;
  day: number;
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function dateKeyToUtcMs(dateKey: DateKey): number {
  const { year, month, day } = parseDateKey(dateKey);
  return Date.UTC(year, month - 1, day);
}

export function formatDateKey(parts: CalendarDateParts): DateKey {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function parseDateKey(dateKey: string): CalendarDateParts {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error(`Invalid date key: ${dateKey}`);
  }

  const [yearText, monthText, dayText] = dateKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const utcDate = new Date(Date.UTC(year, month - 1, day));

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    throw new Error(`Invalid date key: ${dateKey}`);
  }

  return {
    year,
    month,
    day,
  };
}

export function addDays(dateKey: DateKey, days: number): DateKey {
  const utcMs = dateKeyToUtcMs(dateKey);
  return formatDateKeyFromUtcMs(utcMs + days * MS_PER_DAY);
}

export function diffDays(startDateKey: DateKey, endDateKey: DateKey): number {
  return Math.round((dateKeyToUtcMs(endDateKey) - dateKeyToUtcMs(startDateKey)) / MS_PER_DAY);
}

export function weekdayIndexFromDateKey(dateKey: DateKey): number {
  const weekday = new Date(dateKeyToUtcMs(dateKey)).getUTCDay();
  return weekday === 0 ? 6 : weekday - 1;
}

export function startOfWeekMonday(dateKey: DateKey): DateKey {
  return addDays(dateKey, -weekdayIndexFromDateKey(dateKey));
}

export function endOfWeekSunday(dateKey: DateKey): DateKey {
  return addDays(startOfWeekMonday(dateKey), 6);
}

export function weekNumberFromStart(startDateKey: DateKey, targetDateKey: DateKey): number {
  const diff = diffDays(startDateKey, targetDateKey);
  return Math.floor(diff / 7) + 1;
}

export function weekdayNameFromDateKey(dateKey: DateKey): string {
  return [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ][weekdayIndexFromDateKey(dateKey)]!;
}

export function dateKeyFromEpochMs(epochMs: number, timeZone: string): DateKey {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(new Date(epochMs));
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error(`Unable to derive date key for timezone ${timeZone}.`);
  }

  return formatDateKey({ year, month, day });
}

function formatDateKeyFromUtcMs(utcMs: number): DateKey {
  const date = new Date(utcMs);
  return formatDateKey({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}
