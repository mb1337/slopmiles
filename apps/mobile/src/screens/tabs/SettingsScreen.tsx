import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, ScrollView, Text, TextInput, View } from "react-native";
import { useQuery } from "convex/react";
import {
  COMPETITIVENESS_LEVELS,
  PERSONALITY_PRESETS,
  VOLUME_MODES,
  WEEKDAYS,
  type CompetitivenessLevel,
  type Personality,
  type RunningSchedule,
  type UnitPreference,
  type VolumeMode,
  type Weekday,
} from "@slopmiles/domain";
import { useAuthActions } from "@convex-dev/auth/react";

import { api } from "../../convex";
import {
  ChoiceRow,
  Counter,
  CrossPlatformPickerSheet,
  FieldGroup,
  Panel,
  PickerField,
  PrimaryButton,
  ScreenHeader,
  SecondaryButton,
  TagGrid,
} from "../../components/common";
import { styles } from "../../styles";
import type { HealthKitSyncResult } from "../../types";

type AvailabilityWindowField = {
  start: string;
  end: string;
};

type AvailabilityWindowFields = Partial<
  Record<
    Weekday,
    {
      morning?: AvailabilityWindowField;
      night?: AvailabilityWindowField;
    }
  >
>;

const DEFAULT_WINDOW_PRESETS = {
  morning: {
    start: "06:00",
    end: "07:30",
  },
  night: {
    start: "17:30",
    end: "19:00",
  },
} satisfies Record<"morning" | "night", AvailabilityWindowField>;

function serializeAvailabilityWindows(value: RunningSchedule["availabilityWindows"]): AvailabilityWindowFields {
  const result: AvailabilityWindowFields = {};

  for (const day of WEEKDAYS) {
    const windows = value?.[day];
    if (!windows || windows.length === 0) {
      continue;
    }

    if (windows.length === 1) {
      const onlyWindow = windows[0];
      if (!onlyWindow) {
        continue;
      }

      const [hoursText] = onlyWindow.start.split(":");
      const startHour = Number(hoursText);
      const singlePart = Number.isFinite(startHour) && startHour >= 12 ? "night" : "morning";

      result[day] = {
        [singlePart]: {
          start: onlyWindow.start,
          end: onlyWindow.end,
        },
      };
      continue;
    }

    result[day] = {
      ...(windows[0]
        ? {
            morning: {
              start: windows[0].start,
              end: windows[0].end,
            },
          }
        : {}),
      ...(windows[1]
        ? {
            night: {
              start: windows[1].start,
              end: windows[1].end,
            },
          }
        : {}),
    };
  }

  return result;
}

function isValidClockText(value: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return false;
  }

  const [hoursText, minutesText] = value.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  return Number.isInteger(hours) && Number.isInteger(minutes) && hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function timeTextToDate(value: string): Date {
  const date = new Date();
  const [hoursText, minutesText] = value.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  date.setHours(Number.isFinite(hours) ? hours : 6, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  return date;
}

function dateToTimeText(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatTimeLabel(value: string): string {
  return timeTextToDate(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function buildAvailabilityWindows(
  preferredRunningDays: Weekday[],
  valueByDay: AvailabilityWindowFields,
): RunningSchedule["availabilityWindows"] | null {
  const availabilityWindows: RunningSchedule["availabilityWindows"] = {};

  for (const day of preferredRunningDays) {
    const configured = valueByDay[day];
    if (!configured?.morning && !configured?.night) {
      continue;
    }

    const normalized: AvailabilityWindowField[] = [];
    for (const window of [configured?.morning, configured?.night]) {
      if (!window) {
        continue;
      }
      const start = window.start.trim();
      const end = window.end.trim();
      if (start.length === 0 && end.length === 0) {
        continue;
      }
      if (start.length === 0 || end.length === 0) {
        return null;
      }
      if (!isValidClockText(start) || !isValidClockText(end)) {
        return null;
      }
      if (start >= end) {
        return null;
      }
      normalized.push({ start, end });
    }

    if (normalized.length === 2 && normalized[0] && normalized[1] && normalized[0].end > normalized[1].start) {
      return null;
    }

    if (normalized.length > 0) {
      availabilityWindows[day] = normalized;
    }
  }

  return Object.keys(availabilityWindows).length > 0 ? availabilityWindows : {};
}

function formatAvailabilitySummary(
  windows:
    | {
        morning?: AvailabilityWindowField;
        night?: AvailabilityWindowField;
      }
    | undefined,
): string {
  if (!windows?.morning && !windows?.night) {
    return "Any time";
  }

  return [
    windows.morning ? `Morning ${windows.morning.start}-${windows.morning.end}` : null,
    windows.night ? `Night ${windows.night.start}-${windows.night.end}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function formatSyncTimestamp(timestamp: number | null | undefined): string {
  if (typeof timestamp !== "number") {
    return "Never";
  }

  return new Date(timestamp).toLocaleString();
}

export function SettingsScreen({
  userName,
  unitPreference,
  volumePreference,
  runningSchedule,
  trackAccess,
  competitivenessLevel,
  personality,
  healthKitAuthorized,
  backgroundSyncEnabled,
  backgroundSyncReason,
  onResetApp,
  onUpdateName,
  onUpdateUnitPreference,
  onUpdateVolumePreference,
  onUpdateTrackAccess,
  onUpdateRunningSchedule,
  onUpdateCompetitiveness,
  onUpdatePersonality,
  onSyncHealthKit,
}: {
  userName: string;
  unitPreference: UnitPreference;
  volumePreference: VolumeMode;
  runningSchedule: RunningSchedule;
  trackAccess: boolean;
  competitivenessLevel: CompetitivenessLevel;
  personality: Personality;
  healthKitAuthorized: boolean;
  backgroundSyncEnabled: boolean;
  backgroundSyncReason?: string;
  onResetApp: () => Promise<void>;
  onUpdateName: (name: string) => Promise<void>;
  onUpdateUnitPreference: (unitPreference: UnitPreference) => Promise<void>;
  onUpdateVolumePreference: (volumePreference: VolumeMode) => Promise<void>;
  onUpdateTrackAccess: (trackAccess: boolean) => Promise<void>;
  onUpdateRunningSchedule: (runningSchedule: RunningSchedule) => Promise<void>;
  onUpdateCompetitiveness: (level: CompetitivenessLevel) => Promise<void>;
  onUpdatePersonality: (value: { preset: Personality["name"]; customDescription?: string }) => Promise<void>;
  onSyncHealthKit: () => Promise<HealthKitSyncResult>;
}) {
  const { signOut } = useAuthActions();
  const healthKitImportSummary = useQuery(api.healthkit.getImportSummary, {});
  const [name, setName] = useState(userName);
  const [selectedUnitPreference, setSelectedUnitPreference] = useState<UnitPreference>(unitPreference);
  const [selectedVolumePreference, setSelectedVolumePreference] = useState<VolumeMode>(volumePreference);
  const [selectedTrackAccess, setSelectedTrackAccess] = useState(trackAccess);
  const [preferredRunningDays, setPreferredRunningDays] = useState<Weekday[]>(runningSchedule.preferredRunningDays);
  const [runningDaysPerWeek, setRunningDaysPerWeek] = useState(runningSchedule.runningDaysPerWeek);
  const [preferredLongRunDay, setPreferredLongRunDay] = useState<Weekday | null>(runningSchedule.preferredLongRunDay);
  const [preferredQualityDays, setPreferredQualityDays] = useState<Weekday[]>(runningSchedule.preferredQualityDays);
  const [availabilityWindowsByDay, setAvailabilityWindowsByDay] = useState<AvailabilityWindowFields>(
    serializeAvailabilityWindows(runningSchedule.availabilityWindows),
  );
  const [selectedCompetitiveness, setSelectedCompetitiveness] = useState<CompetitivenessLevel>(competitivenessLevel);
  const [selectedPersonality, setSelectedPersonality] = useState<Personality["name"]>(personality.name);
  const [customPersonalityDescription, setCustomPersonalityDescription] = useState(
    personality.name === "custom" ? personality.description : "",
  );

  const [savingName, setSavingName] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [savingCoaching, setSavingCoaching] = useState(false);
  const [nameMessage, setNameMessage] = useState<string | null>(null);
  const [preferencesMessage, setPreferencesMessage] = useState<string | null>(null);
  const [scheduleMessage, setScheduleMessage] = useState<string | null>(null);
  const [coachingMessage, setCoachingMessage] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [preferencesError, setPreferencesError] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [coachingError, setCoachingError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [syncingHealthKit, setSyncingHealthKit] = useState(false);
  const [healthKitMessage, setHealthKitMessage] = useState<string | null>(null);
  const [healthKitError, setHealthKitError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [activeTimePicker, setActiveTimePicker] = useState<{
    day: Weekday;
    part: "morning" | "night";
    field: "start" | "end";
  } | null>(null);
  const lastAttemptedNameSave = useRef<string | null>(null);
  const lastAttemptedPreferencesSave = useRef<string | null>(null);
  const lastAttemptedScheduleSave = useRef<string | null>(null);
  const lastAttemptedCoachingSave = useRef<string | null>(null);
  const incomingScheduleSignature = useMemo(
    () =>
      JSON.stringify({
        preferredRunningDays: runningSchedule.preferredRunningDays,
        runningDaysPerWeek: runningSchedule.runningDaysPerWeek,
        preferredLongRunDay: runningSchedule.preferredLongRunDay ?? null,
        preferredQualityDays: runningSchedule.preferredQualityDays,
        availabilityWindows: serializeAvailabilityWindows(runningSchedule.availabilityWindows),
      }),
    [
      runningSchedule.availabilityWindows,
      runningSchedule.preferredLongRunDay,
      runningSchedule.preferredQualityDays,
      runningSchedule.preferredRunningDays,
      runningSchedule.runningDaysPerWeek,
    ],
  );
  const incomingPersonalitySignature = useMemo(
    () =>
      JSON.stringify({
        name: personality.name,
        description: personality.description,
      }),
    [personality.description, personality.name],
  );

  useEffect(() => {
    setName(userName);
  }, [userName]);

  useEffect(() => {
    setSelectedUnitPreference(unitPreference);
    setSelectedVolumePreference(volumePreference);
    setSelectedTrackAccess(trackAccess);
  }, [unitPreference, volumePreference, trackAccess]);

  useEffect(() => {
    setPreferredRunningDays(runningSchedule.preferredRunningDays);
    setRunningDaysPerWeek(runningSchedule.runningDaysPerWeek);
    setPreferredLongRunDay(runningSchedule.preferredLongRunDay);
    setPreferredQualityDays(runningSchedule.preferredQualityDays);
    setAvailabilityWindowsByDay(serializeAvailabilityWindows(runningSchedule.availabilityWindows));
  }, [incomingScheduleSignature]);

  useEffect(() => {
    setSelectedCompetitiveness(competitivenessLevel);
  }, [competitivenessLevel]);

  useEffect(() => {
    setSelectedPersonality(personality.name);
    setCustomPersonalityDescription(personality.name === "custom" ? personality.description : "");
  }, [incomingPersonalitySignature]);

  const toggleDay = (day: Weekday) => {
    setPreferredRunningDays((previous) => {
      if (previous.includes(day)) {
        const next = previous.filter((item) => item !== day);
        if (preferredLongRunDay === day) {
          setPreferredLongRunDay(null);
        }
        setPreferredQualityDays((current) => current.filter((item) => item !== day));
        setAvailabilityWindowsByDay((current) => {
          const nextWindows = { ...current };
          delete nextWindows[day];
          return nextWindows;
        });
        return next;
      }
      return [...previous, day];
    });
  };

  const toggleQualityDay = (day: Weekday) => {
    if (!preferredRunningDays.includes(day)) {
      return;
    }

    setPreferredQualityDays((previous) =>
      previous.includes(day) ? previous.filter((item) => item !== day) : [...previous, day],
    );
  };

  const toggleAvailabilityPart = (day: Weekday, part: "morning" | "night") => {
    setAvailabilityWindowsByDay((current) => {
      const next = { ...current };
      const currentDay = current[day] ?? {};
      const hasPart = Boolean(currentDay[part]);

      if (hasPart) {
        const updatedDay = {
          ...currentDay,
          [part]: undefined,
        };
        if (!updatedDay.morning && !updatedDay.night) {
          delete next[day];
          return next;
        }
        next[day] = updatedDay;
        return next;
      }

      next[day] = {
        ...currentDay,
        [part]: currentDay[part] ?? DEFAULT_WINDOW_PRESETS[part],
      };
      return next;
    });
    setScheduleMessage(null);
    setScheduleError(null);
  };

  const updateAvailabilityWindow = (day: Weekday, part: "morning" | "night", field: "start" | "end", value: string) => {
    setAvailabilityWindowsByDay((current) => {
      const currentDay = current[day] ?? {};
      return {
        ...current,
        [day]: {
          ...currentDay,
          [part]: {
            ...(currentDay[part] ?? DEFAULT_WINDOW_PRESETS[part]),
            [field]: value,
          },
        },
      };
    });
    setScheduleMessage(null);
    setScheduleError(null);
  };

  const clampedRunningDays = Math.max(1, Math.min(runningDaysPerWeek, Math.max(1, preferredRunningDays.length)));
  const baselineName = userName.trim();
  const currentName = name.trim();
  const baselinePreferencesSignature = JSON.stringify({
    unitPreference,
    volumePreference,
    trackAccess,
  });
  const currentPreferencesSignature = JSON.stringify({
    unitPreference: selectedUnitPreference,
    volumePreference: selectedVolumePreference,
    trackAccess: selectedTrackAccess,
  });
  const baselineScheduleSignature = JSON.stringify({
    preferredRunningDays: runningSchedule.preferredRunningDays,
    runningDaysPerWeek: runningSchedule.runningDaysPerWeek,
    preferredLongRunDay: runningSchedule.preferredLongRunDay ?? null,
    preferredQualityDays: runningSchedule.preferredQualityDays,
    availabilityWindows: serializeAvailabilityWindows(runningSchedule.availabilityWindows),
  });
  const currentScheduleSignature = JSON.stringify({
    preferredRunningDays,
    runningDaysPerWeek: clampedRunningDays,
    preferredLongRunDay,
    preferredQualityDays,
    availabilityWindows: availabilityWindowsByDay,
  });
  const baselineCoachingSignature = JSON.stringify({
    competitivenessLevel,
    personalityName: personality.name,
    personalityDescription: personality.name === "custom" ? personality.description : "",
  });
  const currentCoachingSignature = JSON.stringify({
    competitivenessLevel: selectedCompetitiveness,
    personalityName: selectedPersonality,
    personalityDescription: selectedPersonality === "custom" ? customPersonalityDescription.trim() : "",
  });

  const runSaveName = async () => {
    const normalizedName = name.trim();
    if (normalizedName.length === 0) {
      setNameError("Name cannot be empty.");
      setNameMessage(null);
      return;
    }

    setSavingName(true);
    setNameError(null);
    setNameMessage(null);
    try {
      await onUpdateName(normalizedName);
      setName(normalizedName);
      setNameMessage("Display name updated.");
    } catch (error) {
      setNameError(String(error));
    } finally {
      setSavingName(false);
    }
  };

  const runSavePreferences = async () => {
    setSavingPreferences(true);
    setPreferencesError(null);
    setPreferencesMessage(null);
    try {
      if (selectedUnitPreference !== unitPreference) {
        await onUpdateUnitPreference(selectedUnitPreference);
      }
      if (selectedVolumePreference !== volumePreference) {
        await onUpdateVolumePreference(selectedVolumePreference);
      }
      if (selectedTrackAccess !== trackAccess) {
        await onUpdateTrackAccess(selectedTrackAccess);
      }
      setPreferencesMessage("Planning preferences updated.");
    } catch (error) {
      setPreferencesError(String(error));
    } finally {
      setSavingPreferences(false);
    }
  };

  const runSaveSchedule = async () => {
    if (preferredRunningDays.length === 0) {
      setScheduleError("Choose at least one running day.");
      setScheduleMessage(null);
      return;
    }

    const availabilityWindows = buildAvailabilityWindows(preferredRunningDays, availabilityWindowsByDay);
    if (availabilityWindows === null) {
      setScheduleError("Time windows must have valid start and end times, and the night window must begin after the morning window.");
      setScheduleMessage(null);
      return;
    }

    setSavingSchedule(true);
    setScheduleError(null);
    setScheduleMessage(null);
    try {
      await onUpdateRunningSchedule({
        preferredRunningDays,
        runningDaysPerWeek: clampedRunningDays,
        preferredLongRunDay,
        preferredQualityDays,
        availabilityWindows,
      });
      setScheduleMessage("Running schedule updated.");
    } catch (error) {
      setScheduleError(String(error));
    } finally {
      setSavingSchedule(false);
    }
  };

  const runSaveCoaching = async () => {
    if (selectedPersonality === "custom" && customPersonalityDescription.trim().length === 0) {
      setCoachingError("Custom personality needs a description.");
      setCoachingMessage(null);
      return;
    }

    setSavingCoaching(true);
    setCoachingError(null);
    setCoachingMessage(null);
    try {
      if (selectedCompetitiveness !== competitivenessLevel) {
        await onUpdateCompetitiveness(selectedCompetitiveness);
      }
      if (
        selectedPersonality !== personality.name ||
        (selectedPersonality === "custom" && customPersonalityDescription.trim() !== personality.description)
      ) {
        await onUpdatePersonality({
          preset: selectedPersonality,
          customDescription: selectedPersonality === "custom" ? customPersonalityDescription.trim() : undefined,
        });
      }
      setCoachingMessage("Coach style updated.");
    } catch (error) {
      setCoachingError(String(error));
    } finally {
      setSavingCoaching(false);
    }
  };

  useEffect(() => {
    if (currentName.length === 0) {
      setNameError("Name cannot be empty.");
      return;
    }

    setNameError(null);
    if (currentName === baselineName || lastAttemptedNameSave.current === currentName) {
      return;
    }

    const timer = setTimeout(() => {
      lastAttemptedNameSave.current = currentName;
      void runSaveName();
    }, 500);

    return () => clearTimeout(timer);
  }, [baselineName, currentName]);

  useEffect(() => {
    setPreferencesError(null);
    if (
      currentPreferencesSignature === baselinePreferencesSignature ||
      lastAttemptedPreferencesSave.current === currentPreferencesSignature
    ) {
      return;
    }

    const timer = setTimeout(() => {
      lastAttemptedPreferencesSave.current = currentPreferencesSignature;
      void runSavePreferences();
    }, 300);

    return () => clearTimeout(timer);
  }, [baselinePreferencesSignature, currentPreferencesSignature]);

  useEffect(() => {
    if (preferredRunningDays.length === 0) {
      setScheduleError("Choose at least one running day.");
      return;
    }

    if (buildAvailabilityWindows(preferredRunningDays, availabilityWindowsByDay) === null) {
      setScheduleError("Time windows must have valid start and end times, and the night window must begin after the morning window.");
      return;
    }

    setScheduleError(null);
    if (
      currentScheduleSignature === baselineScheduleSignature ||
      lastAttemptedScheduleSave.current === currentScheduleSignature
    ) {
      return;
    }

    const timer = setTimeout(() => {
      lastAttemptedScheduleSave.current = currentScheduleSignature;
      void runSaveSchedule();
    }, 500);

    return () => clearTimeout(timer);
  }, [availabilityWindowsByDay, baselineScheduleSignature, currentScheduleSignature, preferredRunningDays]);

  useEffect(() => {
    if (selectedPersonality === "custom" && customPersonalityDescription.trim().length === 0) {
      setCoachingError("Custom personality needs a description.");
      return;
    }

    setCoachingError(null);
    if (
      currentCoachingSignature === baselineCoachingSignature ||
      lastAttemptedCoachingSave.current === currentCoachingSignature
    ) {
      return;
    }

    const timer = setTimeout(() => {
      lastAttemptedCoachingSave.current = currentCoachingSignature;
      void runSaveCoaching();
    }, 500);

    return () => clearTimeout(timer);
  }, [baselineCoachingSignature, currentCoachingSignature, customPersonalityDescription, selectedPersonality]);

  const runReset = async () => {
    setResetting(true);
    setResetError(null);
    try {
      await onResetApp();
    } catch (error) {
      setResetError(String(error));
    } finally {
      setResetting(false);
    }
  };

  const runHealthKitSync = async () => {
    setSyncingHealthKit(true);
    setHealthKitError(null);
    setHealthKitMessage(null);
    try {
      const result = await onSyncHealthKit();
      if (!result.authorized) {
        setHealthKitMessage(result.reason ?? "HealthKit access was not granted.");
        return;
      }

      setHealthKitMessage(
        result.reason
          ? `HealthKit connected, but import failed: ${result.reason}`
          : `Imported ${result.processedCount} workouts (${result.insertedCount} new, ${result.updatedCount} updated).`,
      );
    } catch (error) {
      setHealthKitError(String(error));
    } finally {
      setSyncingHealthKit(false);
    }
  };

  const runSignOut = async () => {
    setSigningOut(true);
    setSignOutError(null);
    try {
      await signOut();
    } catch (error) {
      setSignOutError(String(error));
    } finally {
      setSigningOut(false);
    }
  };

  const confirmReset = () => {
    Alert.alert(
      "Reset app data?",
      "This permanently deletes your profile data, plans, coach history, and onboarding progress, then signs you out.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Reset App",
          style: "destructive",
          onPress: () => {
            void runReset();
          },
        },
      ],
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader
        eyebrow="Settings"
        title="Profile and coaching"
        subtitle="Put the frequent controls first: sync, profile, schedule, and coaching behavior."
      />

      <Panel title="HealthKit Sync">
        <Text style={styles.bodyText}>
          Status: {healthKitAuthorized ? "Connected" : "Not connected"}. Connect or re-sync to keep recent running history and matching current.
        </Text>
        <Text style={styles.helperText}>
          Background sync: {backgroundSyncEnabled ? "Enabled" : "Unavailable"}
          {backgroundSyncReason ? ` · ${backgroundSyncReason}` : ""}
        </Text>
        <Text style={styles.helperText}>
          Last sync: {formatSyncTimestamp(healthKitImportSummary?.lastSyncAt)}
          {healthKitImportSummary?.lastSyncSource ? ` via ${healthKitImportSummary.lastSyncSource}` : ""}
        </Text>
        {healthKitImportSummary?.lastSyncError ? (
          <Text style={styles.helperText}>Latest sync issue: {healthKitImportSummary.lastSyncError}</Text>
        ) : null}
        {healthKitMessage ? <Text style={styles.helperText}>{healthKitMessage}</Text> : null}
        {healthKitError ? <Text style={styles.errorText}>{healthKitError}</Text> : null}
        <PrimaryButton
          label={syncingHealthKit ? "Syncing HealthKit..." : healthKitAuthorized ? "Re-sync HealthKit" : "Connect HealthKit"}
          onPress={() => {
            void runHealthKitSync();
          }}
          disabled={syncingHealthKit || resetting || signingOut}
        />
      </Panel>

      <Panel title="Profile">
        <FieldGroup label="Display name">
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={(value) => {
            setName(value);
            setNameMessage(null);
            setNameError(null);
          }}
          autoCapitalize="words"
          placeholder="Runner"
          placeholderTextColor="#7a848c"
        />
        </FieldGroup>
        {nameMessage ? <Text style={styles.helperText}>{nameMessage}</Text> : null}
        {nameError ? <Text style={styles.errorText}>{nameError}</Text> : null}
        {savingName ? <Text style={styles.helperText}>Saving name...</Text> : null}
      </Panel>

      <Panel title="Planning Preferences">
        <Text style={styles.bodyText}>Control how the coach frames volume and what workout formats it can assume.</Text>
        <FieldGroup label="Unit preference">
          <ChoiceRow
            options={["system", "metric", "imperial"]}
            selected={selectedUnitPreference}
            onChange={(value) => {
              setSelectedUnitPreference(value as UnitPreference);
              setPreferencesMessage(null);
              setPreferencesError(null);
            }}
          />
        </FieldGroup>
        <FieldGroup label="Volume mode">
          <ChoiceRow
            options={VOLUME_MODES}
            selected={selectedVolumePreference}
            onChange={(value) => {
              setSelectedVolumePreference(value as VolumeMode);
              setPreferencesMessage(null);
              setPreferencesError(null);
            }}
          />
        </FieldGroup>
        <FieldGroup label="Track access">
          <ChoiceRow
            options={["yes", "no"]}
            selected={selectedTrackAccess ? "yes" : "no"}
            onChange={(value) => {
              setSelectedTrackAccess(value === "yes");
              setPreferencesMessage(null);
              setPreferencesError(null);
            }}
          />
        </FieldGroup>
        {preferencesMessage ? <Text style={styles.helperText}>{preferencesMessage}</Text> : null}
        {preferencesError ? <Text style={styles.errorText}>{preferencesError}</Text> : null}
        {savingPreferences ? <Text style={styles.helperText}>Saving planning preferences...</Text> : null}
      </Panel>

      <Panel title="Running Schedule">
        <FieldGroup label="Preferred running days">
          <TagGrid options={WEEKDAYS} selected={preferredRunningDays} onToggle={(day) => toggleDay(day as Weekday)} />
        </FieldGroup>
        <FieldGroup label="Target days per week">
          <Counter value={clampedRunningDays} min={1} max={Math.max(1, preferredRunningDays.length)} onChange={setRunningDaysPerWeek} />
        </FieldGroup>
        <View style={styles.subtleBlock}>
          <FieldGroup label="Preferred long run day">
            <ChoiceRow
              options={["none", ...preferredRunningDays]}
              selected={preferredLongRunDay ?? "none"}
              onChange={(value) => {
                setPreferredLongRunDay(value === "none" ? null : (value as Weekday));
                setScheduleMessage(null);
                setScheduleError(null);
              }}
            />
          </FieldGroup>

          <FieldGroup label="Preferred quality days">
            <TagGrid options={preferredRunningDays} selected={preferredQualityDays} onToggle={(day) => toggleQualityDay(day as Weekday)} />
          </FieldGroup>
        </View>
        <View style={styles.subtleBlock}>
          <Text style={styles.label}>Availability windows</Text>
          <Text style={styles.helperText}>Choose any time, one window, or two windows for each running day.</Text>
          {preferredRunningDays.map((day) => (
            <View key={day} style={styles.availabilityDayCard}>
              <View style={styles.availabilityDayHeader}>
                <Text style={styles.sectionCardTitle}>{day}</Text>
                <Text style={styles.helperText}>{formatAvailabilitySummary(availabilityWindowsByDay[day])}</Text>
              </View>
              <TagGrid
                options={["morning", "night"]}
                selected={[
                  ...(availabilityWindowsByDay[day]?.morning ? ["morning"] : []),
                  ...(availabilityWindowsByDay[day]?.night ? ["night"] : []),
                ]}
                onToggle={(value) => toggleAvailabilityPart(day, value as "morning" | "night")}
              />
              {(["morning", "night"] as const)
                .filter((part) => Boolean(availabilityWindowsByDay[day]?.[part]))
                .map((part) => {
                  const window = availabilityWindowsByDay[day]?.[part];
                  if (!window) {
                    return null;
                  }

                  return (
                <View key={`${day}-${part}`} style={styles.availabilityWindowCard}>
                  <Text style={styles.label}>{part}</Text>
                  <View style={styles.timeInputRow}>
                    <View style={styles.timeInputBlock}>
                      <Text style={styles.helperText}>Start</Text>
                      <PickerField
                        value={formatTimeLabel(window.start)}
                        placeholder="Set start"
                        onPress={() => {
                          setActiveTimePicker({
                            day,
                            part,
                            field: "start",
                          });
                        }}
                      />
                    </View>
                    <View style={styles.timeInputBlock}>
                      <Text style={styles.helperText}>End</Text>
                      <PickerField
                        value={formatTimeLabel(window.end)}
                        placeholder="Set end"
                        onPress={() => {
                          setActiveTimePicker({
                            day,
                            part,
                            field: "end",
                          });
                        }}
                      />
                    </View>
                  </View>
                </View>
                  );
                })}
            </View>
          ))}
        </View>
        {scheduleMessage ? <Text style={styles.helperText}>{scheduleMessage}</Text> : null}
        {scheduleError ? <Text style={styles.errorText}>{scheduleError}</Text> : null}
        {savingSchedule ? <Text style={styles.helperText}>Saving running schedule...</Text> : null}
      </Panel>

      <Panel title="Coach Style">
        <FieldGroup label="Competitiveness">
          <ChoiceRow
            options={COMPETITIVENESS_LEVELS}
            selected={selectedCompetitiveness}
            onChange={(value) => {
              setSelectedCompetitiveness(value as CompetitivenessLevel);
              setCoachingMessage(null);
              setCoachingError(null);
            }}
          />
        </FieldGroup>
        <FieldGroup label="Personality">
          <ChoiceRow
            options={PERSONALITY_PRESETS}
            selected={selectedPersonality}
            onChange={(value) => {
              setSelectedPersonality(value as Personality["name"]);
              setCoachingMessage(null);
              setCoachingError(null);
            }}
          />
        </FieldGroup>
        {selectedPersonality === "custom" ? (
          <FieldGroup label="Custom personality">
            <TextInput
              style={[styles.input, styles.textArea]}
              value={customPersonalityDescription}
              onChangeText={(value) => {
                setCustomPersonalityDescription(value);
                setCoachingMessage(null);
                setCoachingError(null);
              }}
              multiline
              placeholder="Describe your ideal coach voice"
              placeholderTextColor="#7a848c"
            />
          </FieldGroup>
        ) : null}
        {coachingMessage ? <Text style={styles.helperText}>{coachingMessage}</Text> : null}
        {coachingError ? <Text style={styles.errorText}>{coachingError}</Text> : null}
        {savingCoaching ? <Text style={styles.helperText}>Saving coach style...</Text> : null}
      </Panel>

      <Panel title="Advanced">
        <Text style={styles.bodyText}>Reset App wipes stored data, coach history, signs you out, and restarts onboarding on next sign-in.</Text>
        {resetError ? <Text style={styles.errorText}>{resetError}</Text> : null}
        <PrimaryButton
          label={resetting ? "Resetting..." : "Reset App"}
          onPress={confirmReset}
          disabled={resetting || syncingHealthKit || signingOut}
        />
      </Panel>

      <Panel title="Account">
        <Text style={styles.bodyText}>Signing out clears your local session and returns you to Apple sign-in.</Text>
        {signOutError ? <Text style={styles.errorText}>{signOutError}</Text> : null}
        <SecondaryButton
          label={signingOut ? "Signing out..." : "Sign Out"}
          onPress={() => {
            void runSignOut();
          }}
          disabled={signingOut || resetting || syncingHealthKit}
        />
      </Panel>

      <CrossPlatformPickerSheet
        visible={activeTimePicker !== null}
        title={
          activeTimePicker
            ? `${activeTimePicker.day} ${activeTimePicker.part} ${activeTimePicker.field === "start" ? "start" : "end"}`
            : "Edit time"
        }
        mode="time"
        value={
          activeTimePicker
            ? timeTextToDate(
                availabilityWindowsByDay[activeTimePicker.day]?.[activeTimePicker.part]?.[activeTimePicker.field] ??
                  DEFAULT_WINDOW_PRESETS[activeTimePicker.part][activeTimePicker.field],
              )
            : timeTextToDate(DEFAULT_WINDOW_PRESETS.morning.start)
        }
        onCancel={() => {
          setActiveTimePicker(null);
        }}
        onConfirm={(nextDate) => {
          if (!activeTimePicker) {
            return;
          }

          updateAvailabilityWindow(activeTimePicker.day, activeTimePicker.part, activeTimePicker.field, dateToTimeText(nextDate));
          setActiveTimePicker(null);
        }}
      />
    </ScrollView>
  );
}
