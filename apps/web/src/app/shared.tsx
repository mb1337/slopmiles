import type { ReactNode } from "react";
import {
  DISTANCE_UNITS,
  EFFORT_MODIFIERS,
  PLAN_INTERRUPTION_TYPES,
  STRENGTH_EQUIPMENT_OPTIONS,
  SURFACE_TYPES,
  WEEKDAYS,
  formatFriendlyLabel as domainFormatFriendlyLabel,
  formatWorkoutTypeLabel,
  type Weekday,
} from "@slopmiles/domain";
import { Link } from "react-router-dom";

export const weekdayOptions: Weekday[] = [...WEEKDAYS];

export const raceGoalPresets = ["5K", "10K", "Half Marathon", "Marathon"] as const;
export const nonRaceGoalPresets = ["Base Building", "Recovery"] as const;
export const strengthEquipmentOptions = STRENGTH_EQUIPMENT_OPTIONS;
export const distanceUnitOptions = DISTANCE_UNITS;
export const surfaceOptions = SURFACE_TYPES;
export const interruptionOptions = PLAN_INTERRUPTION_TYPES;
export const effortModifierOptions = EFFORT_MODIFIERS;
export const coachPromptPresets = [
  "What should I focus on this week?",
  "I need help adjusting a workout.",
  "I feel more tired than expected. What should change?",
  "What should my next goal be?",
] as const;

export type StrengthEquipmentOption = (typeof strengthEquipmentOptions)[number];
export type DistanceUnitOption = (typeof distanceUnitOptions)[number];
export type SurfaceOption = (typeof surfaceOptions)[number];
export type InterruptionOption = (typeof interruptionOptions)[number];
export type EffortModifierOption = (typeof effortModifierOptions)[number];

export function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function formatWorkoutType(type: string) {
  return formatWorkoutTypeLabel(type);
}

export function formatFriendlyLabel(value: string) {
  return domainFormatFriendlyLabel(value);
}

export function formatWeekdayLabel(day: Weekday) {
  return formatFriendlyLabel(day);
}

export function formatWeekdayShort(day: Weekday) {
  return formatWeekdayLabel(day).slice(0, 3);
}

export function parseDurationInput(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) ? seconds : undefined;
  }

  const parts = trimmed.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) {
    return undefined;
  }

  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    if (minutes === undefined || seconds === undefined) {
      return undefined;
    }
    return minutes * 60 + seconds;
  }

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    if (hours === undefined || minutes === undefined || seconds === undefined) {
      return undefined;
    }
    return hours * 3600 + minutes * 60 + seconds;
  }

  return undefined;
}

export function formatDurationInput(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "";
  }

  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = Math.floor(value % 60);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function toMeters(value: string, unit: DistanceUnitOption) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return undefined;
  }

  switch (unit) {
    case "meters":
      return numeric;
    case "kilometers":
      return numeric * 1000;
    case "miles":
      return numeric * 1609.344;
    default:
      return undefined;
  }
}

export function toggleArrayValue<T extends string>(value: T, current: T[]) {
  return current.includes(value)
    ? current.filter((entry) => entry !== value)
    : [...current, value];
}

export function clampRunningDaysPerWeek(value: number, selectedDays: Weekday[]) {
  if (selectedDays.length === 0) {
    return 1;
  }

  return Math.max(1, Math.min(Math.round(value), selectedDays.length));
}

export function Button({
  children,
  onClick,
  kind = "primary",
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      className={cx("button", `button-${kind}`)}
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  );
}

export function ActionLink({
  children,
  to,
  kind = "primary",
}: {
  children: ReactNode;
  to: string;
  kind?: "primary" | "secondary" | "danger";
}) {
  return (
    <Link className={cx("button", "button-link", `button-${kind}`)} to={to}>
      {children}
    </Link>
  );
}

export function Card({
  title,
  eyebrow,
  children,
  actions,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
          <h2>{title}</h2>
        </div>
        {actions ? <div className="panel-actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function StatusMessage({
  message,
  tone = "neutral",
}: {
  message: string;
  tone?: "neutral" | "error" | "success";
}) {
  return <div className={cx("status", `status-${tone}`)}>{message}</div>;
}

export function Screen({
  title,
  subtitle,
  children,
  actions,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="screen">
      <header className="screen-head">
        <div>
          <div className="eyebrow">SlopMiles Companion</div>
          <h1>{title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {actions ? <div className="screen-actions">{actions}</div> : null}
      </header>
      {children}
    </div>
  );
}

export function DayPicker({
  days,
  onToggle,
}: {
  days: Weekday[];
  onToggle: (day: Weekday) => void;
}) {
  return (
    <div className="pill-row wrap">
      {weekdayOptions.map((day) => (
        <button
          key={day}
          className={cx("pill-button", days.includes(day) && "pill-button-active")}
          onClick={() => onToggle(day)}
          type="button"
        >
          {formatWeekdayShort(day)}
        </button>
      ))}
    </div>
  );
}
