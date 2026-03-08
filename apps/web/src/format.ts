import type { UnitPreference } from "@slopmiles/domain";

const IMPERIAL_REGION_CODES = new Set(["US", "LR", "MM"]);

function resolveLocaleRegion(locale: string): string | null {
  const parts = locale.split("-").filter(Boolean);

  for (let index = 1; index < parts.length; index += 1) {
    const part = parts[index]!;
    if (/^[A-Za-z]{2}$/.test(part)) {
      return part.toUpperCase();
    }
  }

  return null;
}

function prefersImperial(unitPreference: UnitPreference) {
  if (unitPreference === "imperial") {
    return true;
  }

  if (unitPreference === "metric") {
    return false;
  }

  const locale = Intl.DateTimeFormat().resolvedOptions().locale;
  const region = resolveLocaleRegion(locale);
  return region !== null ? IMPERIAL_REGION_CODES.has(region) : false;
}

export function formatDateKey(dateKey: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dateKey}T00:00:00Z`));
}

export function formatDateTime(timestamp: number) {
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDuration(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainder = rounded % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  }

  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function formatDistance(meters: number | undefined, unitPreference: UnitPreference) {
  if (typeof meters !== "number") {
    return "-";
  }

  if (prefersImperial(unitPreference)) {
    return `${(meters / 1609.344).toFixed(2)} mi`;
  }

  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }

  return `${(meters / 1000).toFixed(2)} km`;
}

export function formatPace(paceSecondsPerMeter: number | null | undefined, unitPreference: UnitPreference) {
  if (typeof paceSecondsPerMeter !== "number" || !Number.isFinite(paceSecondsPerMeter) || paceSecondsPerMeter <= 0) {
    return "-";
  }

  const unitMeters = prefersImperial(unitPreference) ? 1609.344 : 1000;
  const seconds = Math.round(paceSecondsPerMeter * unitMeters);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")} / ${prefersImperial(unitPreference) ? "mi" : "km"}`;
}

export function formatVolume(mode: "time" | "distance", absoluteValue: number, unitPreference: UnitPreference) {
  return mode === "time" ? formatDuration(absoluteValue) : formatDistance(absoluteValue, unitPreference);
}

export function formatRaceTime(seconds: number | null | undefined) {
  return typeof seconds === "number" ? formatDuration(seconds) : "-";
}
