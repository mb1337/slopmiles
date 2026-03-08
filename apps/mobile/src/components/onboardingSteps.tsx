import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import {
  COMPETITIVENESS_LEVELS,
  PERSONALITY_PRESETS,
  VOLUME_MODES,
  WEEKDAYS,
  calculateVdotFromRaceTime,
  defaultDistanceInputUnit,
  formatDistanceForDisplay,
  formatDurationClock,
  type CompetitivenessLevel,
  type PersonalityPreset,
  type UnitPreference,
  type VolumeMode,
  type Weekday,
} from "@slopmiles/domain";

import { styles } from "../styles";
import type { Id } from "../convex";
import { ChoiceRow, Counter, FieldGroup, Panel, PrimaryButton, SecondaryButton, TagGrid } from "./common";

type ImportedWorkoutSummary = {
  _id: Id<"healthKitWorkouts">;
  startedAt: number;
  durationSeconds: number;
  distanceMeters?: number;
};

type VdotWorkoutCandidate = ImportedWorkoutSummary & {
  calculatedVdot: number;
};

function parsePositiveNumber(raw: string): number | null {
  const value = Number(raw.trim());
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  return value;
}

function parseNonNegativeInteger(raw: string): number | null {
  if (raw.trim().length === 0) {
    return 0;
  }

  const value = Number(raw.trim());
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    return null;
  }

  return value;
}

function toMeters(distance: number, unit: "km" | "mi" | "m"): number {
  if (unit === "km") {
    return distance * 1000;
  }
  if (unit === "mi") {
    return distance * 1609.344;
  }
  return distance;
}

function roundVdot(vdot: number): number {
  return Math.round(vdot * 10) / 10;
}

function personalityPreview(preset: PersonalityPreset, customDescription: string): string {
  if (preset === "cheerleader") {
    return "You stacked another strong day. Let's keep the momentum and build on it.";
  }

  if (preset === "noNonsense") {
    return "Hit the key session. Keep easy days easy and stop overcomplicating the week.";
  }

  if (preset === "nerd") {
    return "Your aerobic work is setting up the threshold sessions exactly the way we want.";
  }

  if (preset === "zen") {
    return "Stay patient with the process. Today's work is one calm step in the larger arc.";
  }

  return customDescription.trim() || "Describe your ideal coach voice and the app will use that tone.";
}

export function StepCard({
  title,
  body,
  actionLabel,
  onAction,
  busy,
}: {
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
  busy: boolean;
}) {
  return (
    <Panel title={title}>
      <Text style={styles.bodyText}>{body}</Text>
      <PrimaryButton label={actionLabel} onPress={onAction} disabled={busy} />
    </Panel>
  );
}

export function HealthKitStep({
  busy,
  onAuthorize,
  onSkip,
}: {
  busy: boolean;
  onAuthorize: () => void;
  onSkip: () => void;
}) {
  return (
    <Panel title="HealthKit Authorization">
      <Text style={styles.bodyText}>
        Allow access to running workouts, route data, heart rate, resting heart rate, and date of birth so SlopMiles can
        match workouts, import training history, and set safe default HR guidance.
      </Text>
      <PrimaryButton label="Allow HealthKit Access" onPress={onAuthorize} disabled={busy} />
      <SecondaryButton label="Continue without HealthKit" onPress={onSkip} disabled={busy} />
    </Panel>
  );
}

export function EstablishVdotStep({
  historyWorkouts,
  unitPreference,
  busy,
  onSubmitFromHistory,
  onSubmitManual,
  onSkip,
}: {
  historyWorkouts: ImportedWorkoutSummary[] | undefined;
  unitPreference: UnitPreference;
  busy: boolean;
  onSubmitFromHistory: (workoutId: Id<"healthKitWorkouts">) => void;
  onSubmitManual: (value: { distanceMeters: number; timeSeconds: number }) => void;
  onSkip: () => void;
}) {
  const [entryMode, setEntryMode] = useState<"history" | "manual">("history");
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<Id<"healthKitWorkouts"> | null>(null);
  const [manualDistance, setManualDistance] = useState("5");
  const [manualUnit, setManualUnit] = useState<"km" | "mi" | "m">(() => defaultDistanceInputUnit(unitPreference));
  const [hours, setHours] = useState("0");
  const [minutes, setMinutes] = useState("25");
  const [seconds, setSeconds] = useState("0");

  const topHistoryWorkouts = useMemo(() => {
    const candidates: VdotWorkoutCandidate[] = [];

    for (const workout of historyWorkouts ?? []) {
      if (typeof workout.distanceMeters !== "number" || workout.distanceMeters <= 0 || workout.durationSeconds <= 0) {
        continue;
      }

      const vdot = roundVdot(calculateVdotFromRaceTime(workout.distanceMeters, workout.durationSeconds));
      if (!Number.isFinite(vdot) || vdot <= 0) {
        continue;
      }

      candidates.push({
        ...workout,
        calculatedVdot: vdot,
      });
    }

    candidates.sort((left, right) => right.calculatedVdot - left.calculatedVdot);
    return candidates.slice(0, 3);
  }, [historyWorkouts]);

  const selectedWorkout = useMemo(
    () => topHistoryWorkouts.find((workout) => workout._id === selectedWorkoutId) ?? null,
    [topHistoryWorkouts, selectedWorkoutId],
  );

  const historyVdotPreview = selectedWorkout?.calculatedVdot ?? null;

  const parsedDistance = parsePositiveNumber(manualDistance);
  const parsedHours = parseNonNegativeInteger(hours);
  const parsedMinutes = parseNonNegativeInteger(minutes);
  const parsedSeconds = parseNonNegativeInteger(seconds);
  const validClockValues =
    parsedHours !== null &&
    parsedMinutes !== null &&
    parsedSeconds !== null &&
    parsedMinutes < 60 &&
    parsedSeconds < 60;
  const manualTimeSeconds =
    validClockValues && parsedHours !== null && parsedMinutes !== null && parsedSeconds !== null
      ? parsedHours * 3600 + parsedMinutes * 60 + parsedSeconds
      : 0;
  const manualDistanceMeters = parsedDistance ? toMeters(parsedDistance, manualUnit) : null;
  const manualVdotPreview =
    manualDistanceMeters && manualTimeSeconds > 0
      ? roundVdot(calculateVdotFromRaceTime(manualDistanceMeters, manualTimeSeconds))
      : null;

  useEffect(() => {
    if (topHistoryWorkouts.length === 0) {
      setEntryMode("manual");
    }
  }, [topHistoryWorkouts.length]);

  return (
    <Panel title="Establish VDOT">
      <Text style={styles.bodyText}>Pick a recent result source to set your starting training paces.</Text>
      <Text style={styles.helperText}>
        Recommended source: {topHistoryWorkouts.length > 0 ? "recent history" : "manual result"}.
      </Text>
      <ChoiceRow options={["history", "manual"]} selected={entryMode} onChange={(value) => setEntryMode(value as "history" | "manual")} />

      {entryMode === "history" ? (
        <>
          <Text style={styles.label}>Recent workout history</Text>
          {historyWorkouts === undefined ? <Text style={styles.helperText}>Loading imported workouts...</Text> : null}
          {historyWorkouts && topHistoryWorkouts.length === 0 ? (
            <Text style={styles.helperText}>No eligible workouts yet. Switch to manual entry or sync HealthKit first.</Text>
          ) : null}
          {topHistoryWorkouts.map((workout) => {
            const selected = selectedWorkoutId === workout._id;
            return (
              <Pressable
                key={String(workout._id)}
                style={[
                  styles.historyWorkoutBlock,
                  selected ? { borderColor: "#165177", backgroundColor: "#e5f0f7" } : null,
                ]}
                onPress={() => setSelectedWorkoutId(workout._id)}
              >
                <Text style={styles.historyWorkoutTitle}>{new Date(workout.startedAt).toLocaleDateString()}</Text>
                <Text style={styles.helperText}>
                  {formatDistanceForDisplay(workout.distanceMeters, unitPreference)} ·{" "}
                  {formatDurationClock(workout.durationSeconds)} · VDOT{" "}
                  {workout.calculatedVdot.toFixed(1)}
                </Text>
              </Pressable>
            );
          })}

          {historyVdotPreview !== null ? (
            <Text style={styles.helperText}>Estimated VDOT from selected workout: {historyVdotPreview.toFixed(1)}</Text>
          ) : null}

          <PrimaryButton
            label="Use selected workout"
            disabled={busy || !selectedWorkoutId}
            onPress={() => {
              if (selectedWorkoutId) {
                onSubmitFromHistory(selectedWorkoutId);
              }
            }}
          />
        </>
      ) : null}

      {entryMode === "manual" ? (
        <>
          <Text style={styles.label}>Distance</Text>
          <TextInput
            style={styles.input}
            value={manualDistance}
            onChangeText={setManualDistance}
            keyboardType="decimal-pad"
            placeholder="5"
            placeholderTextColor="#7a848c"
          />
          <ChoiceRow options={["km", "mi", "m"]} selected={manualUnit} onChange={(value) => setManualUnit(value as "km" | "mi" | "m")} />

          <Text style={styles.label}>Finish time</Text>
          <View style={styles.timeInputRow}>
            <View style={styles.timeInputBlock}>
              <Text style={styles.helperText}>Hours</Text>
              <TextInput
                style={styles.input}
                value={hours}
                onChangeText={setHours}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor="#7a848c"
              />
            </View>
            <View style={styles.timeInputBlock}>
              <Text style={styles.helperText}>Minutes</Text>
              <TextInput
                style={styles.input}
                value={minutes}
                onChangeText={setMinutes}
                keyboardType="number-pad"
                placeholder="25"
                placeholderTextColor="#7a848c"
              />
            </View>
            <View style={styles.timeInputBlock}>
              <Text style={styles.helperText}>Seconds</Text>
              <TextInput
                style={styles.input}
                value={seconds}
                onChangeText={setSeconds}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor="#7a848c"
              />
            </View>
          </View>

          {manualVdotPreview !== null ? (
            <Text style={styles.helperText}>Estimated VDOT from manual result: {manualVdotPreview.toFixed(1)}</Text>
          ) : (
            <Text style={styles.helperText}>Enter a positive distance and valid finish time.</Text>
          )}

          <PrimaryButton
            label="Use manual result"
            disabled={busy || manualDistanceMeters === null || manualTimeSeconds <= 0 || !validClockValues}
            onPress={() => {
              if (manualDistanceMeters !== null && manualTimeSeconds > 0) {
                onSubmitManual({
                  distanceMeters: manualDistanceMeters,
                  timeSeconds: manualTimeSeconds,
                });
              }
            }}
          />
        </>
      ) : null}

      <SecondaryButton label="Use conservative paces" onPress={onSkip} disabled={busy} />
    </Panel>
  );
}

export function ProfileBasicsStep({
  defaultUnit,
  defaultVolumeMode,
  onSubmit,
  busy,
}: {
  defaultUnit: UnitPreference;
  defaultVolumeMode: VolumeMode;
  onSubmit: (value: {
    unitPreference: UnitPreference;
    volumePreference: VolumeMode;
  }) => void;
  busy: boolean;
}) {
  const [unitPreference, setUnitPreference] = useState<UnitPreference>(defaultUnit);
  const [volumePreference, setVolumePreference] = useState<VolumeMode>(defaultVolumeMode);

  return (
    <Panel title="Profile Basics">
      <Text style={styles.label}>Unit preference</Text>
      <ChoiceRow
        options={["system", "metric", "imperial"]}
        selected={unitPreference}
        onChange={(value) => setUnitPreference(value as UnitPreference)}
      />
      <Text style={styles.label}>Volume mode</Text>
      <ChoiceRow
        options={VOLUME_MODES}
        selected={volumePreference}
        onChange={(value) => setVolumePreference(value as VolumeMode)}
      />
      <PrimaryButton
        label="Save and continue"
        disabled={busy}
        onPress={() =>
          onSubmit({
            unitPreference,
            volumePreference,
          })
        }
      />
    </Panel>
  );
}

export function RunningScheduleStep({
  defaultDays,
  defaultDaysPerWeek,
  defaultLongRunDay,
  defaultQualityDays,
  onSubmit,
  busy,
}: {
  defaultDays: Weekday[];
  defaultDaysPerWeek: number;
  defaultLongRunDay: Weekday | null;
  defaultQualityDays: Weekday[];
  onSubmit: (value: {
    preferredRunningDays: Weekday[];
    runningDaysPerWeek: number;
    preferredLongRunDay: Weekday | null;
    preferredQualityDays: Weekday[];
  }) => void;
  busy: boolean;
}) {
  const [preferredRunningDays, setPreferredRunningDays] = useState<Weekday[]>(defaultDays);
  const [runningDaysPerWeek, setRunningDaysPerWeek] = useState(defaultDaysPerWeek);
  const [preferredLongRunDay, setPreferredLongRunDay] = useState<Weekday | null>(
    defaultLongRunDay ?? (defaultDays.includes("sunday") ? "sunday" : defaultDays[0] ?? null),
  );
  const [preferredQualityDays, setPreferredQualityDays] = useState<Weekday[]>(defaultQualityDays);

  const toggleDay = (day: Weekday) => {
    setPreferredRunningDays((previous) => {
      if (previous.includes(day)) {
        const next = previous.filter((item) => item !== day);
        if (preferredLongRunDay === day) {
          setPreferredLongRunDay(null);
        }
        setPreferredQualityDays((list) => list.filter((item) => item !== day));
        return next;
      }
      return [...previous, day];
    });
  };

  const toggleQualityDay = (day: Weekday) => {
    if (!preferredRunningDays.includes(day)) {
      return;
    }

    setPreferredQualityDays((previous) => {
      if (previous.includes(day)) {
        return previous.filter((item) => item !== day);
      }
      return [...previous, day];
    });
  };

  const maxDays = preferredRunningDays.length;
  const clampedRunningDays = Math.max(1, Math.min(runningDaysPerWeek, Math.max(1, maxDays)));

  return (
    <Panel title="Running Schedule">
      <FieldGroup label="Preferred running days">
        <TagGrid options={WEEKDAYS} selected={preferredRunningDays} onToggle={(day) => toggleDay(day as Weekday)} />
      </FieldGroup>

      <FieldGroup label="Target days per week">
        <Counter
          value={clampedRunningDays}
          min={1}
          max={Math.max(1, maxDays)}
          onChange={setRunningDaysPerWeek}
        />
      </FieldGroup>

      <FieldGroup label="Preferred long run day">
        <ChoiceRow
          options={["none", ...preferredRunningDays]}
          selected={preferredLongRunDay ?? "none"}
          onChange={(value) => setPreferredLongRunDay(value === "none" ? null : (value as Weekday))}
        />
      </FieldGroup>

      <FieldGroup label="Preferred quality days" helperText="Tap the days you want to protect for quality work.">
        <TagGrid
          options={preferredRunningDays}
          selected={preferredQualityDays}
          onToggle={(day) => toggleQualityDay(day as Weekday)}
        />
      </FieldGroup>

      <PrimaryButton
        label="Save and continue"
        disabled={busy || preferredRunningDays.length === 0}
        onPress={() =>
          onSubmit({
            preferredRunningDays,
            runningDaysPerWeek: clampedRunningDays,
            preferredLongRunDay,
            preferredQualityDays,
          })
        }
      />
    </Panel>
  );
}

export function TrackAccessStep({
  defaultTrackAccess,
  onSubmit,
  busy,
}: {
  defaultTrackAccess: boolean;
  onSubmit: (trackAccess: boolean) => void;
  busy: boolean;
}) {
  const [trackAccess, setTrackAccess] = useState(defaultTrackAccess);

  return (
    <Panel title="Track Access">
      <Text style={styles.bodyText}>Do you have regular access to a running track?</Text>
      <ChoiceRow
        options={["yes", "no"]}
        selected={trackAccess ? "yes" : "no"}
        onChange={(value) => setTrackAccess(value === "yes")}
      />
      <PrimaryButton label="Save and continue" disabled={busy} onPress={() => onSubmit(trackAccess)} />
    </Panel>
  );
}

export function CompetitivenessStep({
  defaultLevel,
  onSubmit,
  busy,
}: {
  defaultLevel: CompetitivenessLevel;
  onSubmit: (value: CompetitivenessLevel) => void;
  busy: boolean;
}) {
  const [level, setLevel] = useState<CompetitivenessLevel>(defaultLevel);

  return (
    <Panel title="Competitiveness">
      <Text style={styles.bodyText}>Pick how aggressively your coach should push training load.</Text>
      <ChoiceRow
        options={COMPETITIVENESS_LEVELS}
        selected={level}
        onChange={(value) => setLevel(value as CompetitivenessLevel)}
      />
      <PrimaryButton label="Save and continue" disabled={busy} onPress={() => onSubmit(level)} />
    </Panel>
  );
}

export function PersonalityStep({
  defaultPersonality,
  defaultCustomDescription,
  onSubmit,
  busy,
}: {
  defaultPersonality: PersonalityPreset;
  defaultCustomDescription: string;
  onSubmit: (value: {
    preset: PersonalityPreset;
    customDescription?: string;
  }) => void;
  busy: boolean;
}) {
  const [preset, setPreset] = useState<PersonalityPreset>(defaultPersonality);
  const [customDescription, setCustomDescription] = useState(defaultCustomDescription);

  return (
    <Panel title="Personality">
      <Text style={styles.bodyText}>Choose the coaching style and voice.</Text>
      <ChoiceRow
        options={PERSONALITY_PRESETS}
        selected={preset}
        onChange={(value) => setPreset(value as PersonalityPreset)}
      />
      {preset === "custom" ? (
        <>
          <Text style={styles.label}>Custom personality</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={customDescription}
            onChangeText={setCustomDescription}
            multiline
            placeholder="Describe your ideal coach voice"
            placeholderTextColor="#7a848c"
          />
        </>
      ) : null}
      <View style={styles.subtleBlock}>
        <Text style={styles.label}>Sample coach message</Text>
        <Text style={styles.bodyText}>{personalityPreview(preset, customDescription)}</Text>
      </View>
      <PrimaryButton
        label="Save and continue"
        disabled={busy || (preset === "custom" && customDescription.trim().length === 0)}
        onPress={() =>
          onSubmit({
            preset,
            customDescription: preset === "custom" ? customDescription.trim() : undefined,
          })
        }
      />
    </Panel>
  );
}
