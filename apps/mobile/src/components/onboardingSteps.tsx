import { useState } from "react";
import { Text, TextInput } from "react-native";

import {
  COMPETITIVENESS_LEVELS,
  PERSONALITY_PRESETS,
  VOLUME_MODES,
  WEEKDAYS,
  type CompetitivenessLevel,
  type PersonalityPreset,
  type UnitPreference,
  type VolumeMode,
  type Weekday,
} from "@slopmiles/domain";

import { styles } from "../styles";
import { ChoiceRow, Counter, Panel, PrimaryButton, SecondaryButton, TagGrid } from "./common";

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

export function ProfileBasicsStep({
  defaultName,
  defaultUnit,
  defaultVolumeMode,
  onSubmit,
  busy,
}: {
  defaultName: string;
  defaultUnit: UnitPreference;
  defaultVolumeMode: VolumeMode;
  onSubmit: (value: {
    name: string;
    unitPreference: UnitPreference;
    volumePreference: VolumeMode;
  }) => void;
  busy: boolean;
}) {
  const [name, setName] = useState(defaultName);
  const [unitPreference, setUnitPreference] = useState<UnitPreference>(defaultUnit);
  const [volumePreference, setVolumePreference] = useState<VolumeMode>(defaultVolumeMode);

  return (
    <Panel title="Profile Basics">
      <Text style={styles.label}>Name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        placeholder="Runner name"
        placeholderTextColor="#7a848c"
      />
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
        disabled={busy || name.trim().length === 0}
        onPress={() =>
          onSubmit({
            name: name.trim(),
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
  const [preferredLongRunDay, setPreferredLongRunDay] = useState<Weekday | null>(defaultLongRunDay);
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
      <Text style={styles.label}>Preferred running days</Text>
      <TagGrid options={WEEKDAYS} selected={preferredRunningDays} onToggle={(day) => toggleDay(day as Weekday)} />

      <Text style={styles.label}>Target days per week</Text>
      <Counter
        value={clampedRunningDays}
        min={1}
        max={Math.max(1, maxDays)}
        onChange={setRunningDaysPerWeek}
      />

      <Text style={styles.label}>Preferred long run day</Text>
      <ChoiceRow
        options={["none", ...preferredRunningDays]}
        selected={preferredLongRunDay ?? "none"}
        onChange={(value) => setPreferredLongRunDay(value === "none" ? null : (value as Weekday))}
      />

      <Text style={styles.label}>Preferred quality days (tap in priority order)</Text>
      <TagGrid
        options={preferredRunningDays}
        selected={preferredQualityDays}
        onToggle={(day) => toggleQualityDay(day as Weekday)}
      />

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
