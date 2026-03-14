import type { EffortModifier, UnitPreference, VolumeMode, WorkoutType } from "./index";
import { resolveRepresentativePaceSecondsPerMeterFromVdot } from "./vdot";

const IMPERIAL_REGION_CODES = new Set(["US", "LR", "MM"]);

function resolveLocaleRegion(locale: string): string | null {
  const parts = locale.split("-").filter(Boolean);

  for (let index = 1; index < parts.length; index += 1) {
    const part = parts[index]!;
    if (/^[A-Za-z]{2}$/.test(part)) {
      return part.toUpperCase();
    }

    if (/^\d{3}$/.test(part)) {
      return part;
    }

    if (part.length === 1 && part.toLowerCase() === "u") {
      break;
    }
  }

  return null;
}

function systemLocale(): string {
  return Intl.DateTimeFormat().resolvedOptions().locale;
}

export function prefersImperialDistance(
  unitPreference: UnitPreference,
  locale: string = systemLocale(),
): boolean {
  if (unitPreference === "imperial") {
    return true;
  }

  if (unitPreference === "metric") {
    return false;
  }

  const region = resolveLocaleRegion(locale);
  return region !== null ? IMPERIAL_REGION_CODES.has(region) : false;
}

export function defaultDistanceInputUnit(
  unitPreference: UnitPreference,
  locale?: string,
): "km" | "mi" {
  return prefersImperialDistance(unitPreference, locale) ? "mi" : "km";
}

export function formatDateKeyForDisplay(dateKey: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dateKey}T00:00:00Z`));
}

export function formatDateTimeForDisplay(timestamp: number, locale?: string): string {
  return new Date(timestamp).toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDurationClock(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainder = rounded % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  }

  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function formatDistanceForDisplay(
  distanceMeters: number | undefined,
  unitPreference: UnitPreference,
  locale?: string,
): string {
  if (typeof distanceMeters !== "number" || !Number.isFinite(distanceMeters)) {
    return "-";
  }

  const normalizedMeters = Math.max(0, distanceMeters);
  const useImperial = prefersImperialDistance(unitPreference, locale);

  if (useImperial) {
    const distanceMiles = normalizedMeters / 1609.344;

    if (distanceMiles > 0 && distanceMiles < 0.01) {
      return "<0.01 mi";
    }

    return `${distanceMiles.toFixed(2)} mi`;
  }

  const roundedMeters = Math.round(normalizedMeters);
  if (roundedMeters < 1000) {
    return `${roundedMeters} m`;
  }

  return `${(normalizedMeters / 1000).toFixed(2)} km`;
}

export function formatPaceSecondsPerMeterForDisplay(
  paceSecondsPerMeter: number | null | undefined,
  unitPreference: UnitPreference,
  locale?: string,
): string {
  const rounded = formatRoundedPaceValue(paceSecondsPerMeter, unitPreference, locale);
  if (!rounded) {
    return "-";
  }

  return `${rounded.clock} / ${rounded.unitLabel}`;
}

export function formatPaceRangeSecondsPerMeterForDisplay(
  paceRangeSecondsPerMeter: readonly [number, number] | null | undefined,
  unitPreference: UnitPreference,
  locale?: string,
): string {
  if (
    !paceRangeSecondsPerMeter ||
    paceRangeSecondsPerMeter.length !== 2 ||
    paceRangeSecondsPerMeter.some((pace) => typeof pace !== "number" || !Number.isFinite(pace) || pace <= 0)
  ) {
    return "-";
  }

  const sortedPaces = [...paceRangeSecondsPerMeter].sort((left, right) => left - right);
  const lower = formatRoundedPaceValue(sortedPaces[0], unitPreference, locale);
  const upper = formatRoundedPaceValue(sortedPaces[1], unitPreference, locale);

  if (!lower || !upper || lower.unitLabel !== upper.unitLabel) {
    return "-";
  }

  return `${lower.clock}-${upper.clock} / ${lower.unitLabel}`;
}

export function formatResolvedPaceTargetForDisplay(
  vdot: number | null | undefined,
  paceZone: string,
  unitPreference: UnitPreference,
  locale?: string,
): string | null {
  const representativePace = resolveRepresentativePaceSecondsPerMeterFromVdot(vdot, paceZone);
  if (representativePace === null) {
    return null;
  }

  const formattedPace = formatPaceSecondsPerMeterForDisplay(representativePace, unitPreference, locale);
  return formattedPace === "-" ? null : formattedPace;
}

function formatRoundedPaceValue(
  paceSecondsPerMeter: number | null | undefined,
  unitPreference: UnitPreference,
  locale?: string,
): { clock: string; unitLabel: "mi" | "km" } | null {
  if (
    typeof paceSecondsPerMeter !== "number" ||
    !Number.isFinite(paceSecondsPerMeter) ||
    paceSecondsPerMeter <= 0
  ) {
    return null;
  }

  const useImperial = prefersImperialDistance(unitPreference, locale);
  const unitMeters = useImperial ? 1609.344 : 1000;
  const paceSeconds = Math.round(paceSecondsPerMeter * unitMeters);
  const minutes = Math.floor(paceSeconds / 60);
  const seconds = paceSeconds % 60;

  return {
    clock: `${minutes}:${String(seconds).padStart(2, "0")}`,
    unitLabel: useImperial ? "mi" : "km",
  };
}

export function formatElevationForDisplay(
  elevationMeters: number | undefined,
  unitPreference: UnitPreference,
  locale?: string,
): string {
  if (typeof elevationMeters !== "number" || !Number.isFinite(elevationMeters)) {
    return "-";
  }

  const normalizedMeters = Math.max(0, elevationMeters);
  if (prefersImperialDistance(unitPreference, locale)) {
    return `${Math.round(normalizedMeters * 3.28084)} ft`;
  }

  return `${Math.round(normalizedMeters)} m`;
}

export function formatVolumeForDisplay(
  mode: VolumeMode,
  absoluteValue: number,
  unitPreference: UnitPreference,
  locale?: string,
): string {
  return mode === "time"
    ? formatDurationClock(absoluteValue)
    : formatDistanceForDisplay(absoluteValue, unitPreference, locale);
}

export function formatFriendlyLabel(value: string): string {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase())
    .trim();
}

export function formatWorkoutTypeLabel(type: WorkoutType | string): string {
  switch (type) {
    case "easyRun":
      return "Easy Run";
    case "longRun":
      return "Long Run";
    case "tempo":
      return "Tempo";
    case "intervals":
      return "Intervals";
    case "recovery":
      return "Recovery";
    default:
      return formatFriendlyLabel(type);
  }
}

export function formatEffortModifierLabel(modifier: EffortModifier | string): string {
  switch (modifier) {
    case "pushedStroller":
      return "Pushed Stroller";
    case "ranWithDog":
      return "Ran with Dog";
    case "trailOffRoad":
      return "Trail / Off-Road";
    case "treadmill":
      return "Treadmill";
    case "highAltitude":
      return "High Altitude";
    case "poorSleep":
      return "Poor Sleep";
    case "feelingUnwell":
      return "Feeling Unwell";
    default:
      return formatFriendlyLabel(modifier);
  }
}
