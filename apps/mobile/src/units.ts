import type { UnitPreference } from "@slopmiles/domain";

const IMPERIAL_REGION_CODES = new Set(["US", "LR", "MM"]);

function resolveLocaleRegion(locale: string): string | null {
  const segments = locale.split("-").filter(Boolean);

  for (let index = 1; index < segments.length; index += 1) {
    const segment = segments[index]!;
    if (/^[A-Za-z]{2}$/.test(segment)) {
      return segment.toUpperCase();
    }

    if (/^\d{3}$/.test(segment)) {
      return segment;
    }

    if (segment.length === 1 && segment.toLowerCase() === "u") {
      break;
    }
  }

  return null;
}

function usesImperialBySystemLocale(): boolean {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale;
  const region = resolveLocaleRegion(locale);
  return region !== null ? IMPERIAL_REGION_CODES.has(region) : false;
}

export function prefersImperialDistance(unitPreference: UnitPreference): boolean {
  if (unitPreference === "imperial") {
    return true;
  }

  if (unitPreference === "metric") {
    return false;
  }

  return usesImperialBySystemLocale();
}

export function defaultDistanceInputUnit(unitPreference: UnitPreference): "km" | "mi" {
  return prefersImperialDistance(unitPreference) ? "mi" : "km";
}

export function formatDistanceForDisplay(distanceMeters: number | undefined, unitPreference: UnitPreference): string {
  if (typeof distanceMeters !== "number") {
    return "-";
  }

  const normalizedMeters = Math.max(0, distanceMeters);

  if (prefersImperialDistance(unitPreference)) {
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
  paceSecondsPerMeter: number | undefined,
  unitPreference: UnitPreference,
): string {
  if (typeof paceSecondsPerMeter !== "number" || !Number.isFinite(paceSecondsPerMeter) || paceSecondsPerMeter <= 0) {
    return "-";
  }

  const unitMeters = prefersImperialDistance(unitPreference) ? 1609.344 : 1000;
  const paceSeconds = paceSecondsPerMeter * unitMeters;
  const roundedPaceSeconds = Math.round(paceSeconds);
  const minutes = Math.floor(roundedPaceSeconds / 60);
  const seconds = roundedPaceSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")} / ${prefersImperialDistance(unitPreference) ? "mi" : "km"}`;
}

export function formatElevationForDisplay(
  elevationMeters: number | undefined,
  unitPreference: UnitPreference,
): string {
  if (typeof elevationMeters !== "number" || !Number.isFinite(elevationMeters)) {
    return "-";
  }

  const normalizedMeters = Math.max(0, elevationMeters);
  if (prefersImperialDistance(unitPreference)) {
    return `${Math.round(normalizedMeters * 3.28084)} ft`;
  }

  return `${Math.round(normalizedMeters)} m`;
}
