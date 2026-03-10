import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, ScrollView, Share, Text, TextInput, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { SETTINGS_COMPONENT_CAPABILITIES } from "@slopmiles/component-contracts";
import {
  COMPETITIVENESS_LEVELS,
  DISTANCE_UNITS,
  PERSONALITY_PRESETS,
  STRENGTH_EQUIPMENT_OPTIONS,
  SURFACE_TYPES,
  VOLUME_MODES,
  WEEKDAYS,
  type CompetitivenessLevel,
  type DistanceUnit,
  type Personality,
  type RunningSchedule,
  type SurfaceType,
  type StrengthEquipment,
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

function toMeters(value: string, unit: DistanceUnit): number | undefined {
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

function parseDurationText(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
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
  const settings = useQuery(api.settings.getSettingsView, {});
  const exportData = useQuery(api.settings.exportData, {});
  const updateStrengthPreferences = useMutation(api.settings.updateStrengthPreferences);
  const upsertCourse = useMutation(api.settings.upsertCourse);
  const deleteCourse = useMutation(api.settings.deleteCourse);
  const upsertRace = useMutation(api.settings.upsertRace);
  const deleteRace = useMutation(api.settings.deleteRace);
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
  const [strengthEnabled, setStrengthEnabled] = useState(false);
  const [strengthEquipment, setStrengthEquipment] = useState<StrengthEquipment[]>([]);
  const [courseName, setCourseName] = useState("");
  const [courseDistanceValue, setCourseDistanceValue] = useState("1");
  const [courseDistanceUnit, setCourseDistanceUnit] = useState<DistanceUnit>("miles");
  const [courseSurface, setCourseSurface] = useState<SurfaceType>("road");
  const [courseNotes, setCourseNotes] = useState("");
  const [raceLabel, setRaceLabel] = useState("");
  const [raceDate, setRaceDate] = useState("");
  const [raceDistanceValue, setRaceDistanceValue] = useState("5");
  const [raceDistanceUnit, setRaceDistanceUnit] = useState<DistanceUnit>("kilometers");
  const [raceGoalTime, setRaceGoalTime] = useState("");
  const [raceActualTime, setRaceActualTime] = useState("");

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
  const [extrasMessage, setExtrasMessage] = useState<string | null>(null);
  const [extrasError, setExtrasError] = useState<string | null>(null);
  const [savingExtras, setSavingExtras] = useState(false);
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

  useEffect(() => {
    setStrengthEnabled(settings?.strengthPreference.enabled ?? false);
    setStrengthEquipment(settings?.strengthPreference.equipment ?? []);
  }, [settings?.strengthPreference.enabled, settings?.strengthPreference.equipment]);

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

  const runExtras = async (task: () => Promise<void>, success: string) => {
    setSavingExtras(true);
    setExtrasMessage(null);
    setExtrasError(null);
    try {
      await task();
      setExtrasMessage(success);
    } catch (error) {
      setExtrasError(String(error));
    } finally {
      setSavingExtras(false);
    }
  };

  const courseDistanceMeters = toMeters(courseDistanceValue, courseDistanceUnit);
  const raceDistanceMeters = toMeters(raceDistanceValue, raceDistanceUnit);

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
          Import capability: {SETTINGS_COMPONENT_CAPABILITIES.healthKitImport === "mobile-only" ? "Managed on mobile only." : "Available on every client."}
        </Text>
        <Text style={styles.helperText}>
          Background sync: {backgroundSyncEnabled ? "Enabled" : "Unavailable"}
          {backgroundSyncReason ? ` · ${backgroundSyncReason}` : ""}
        </Text>
        <Text style={styles.helperText}>
          Last sync: {formatSyncTimestamp(settings?.healthKit.lastSyncAt)}
          {settings?.healthKit.lastSyncSource ? ` via ${settings.healthKit.lastSyncSource}` : ""}
        </Text>
        {settings?.healthKit.lastSyncError ? (
          <Text style={styles.helperText}>Latest sync issue: {settings.healthKit.lastSyncError}</Text>
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

      <Panel title="Strength Defaults">
        <Text style={styles.bodyText}>Keep strength preferences aligned with web so both clients can build the same plan structure.</Text>
        <FieldGroup label="Include strength by default">
          <ChoiceRow
            options={["yes", "no"]}
            selected={strengthEnabled ? "yes" : "no"}
            onChange={(value) => {
              setStrengthEnabled(value === "yes");
              setExtrasMessage(null);
              setExtrasError(null);
            }}
          />
        </FieldGroup>
        {strengthEnabled ? (
          <FieldGroup label="Available equipment">
            <TagGrid
              options={STRENGTH_EQUIPMENT_OPTIONS}
              selected={strengthEquipment}
              onToggle={(value) => {
                const equipment = value as StrengthEquipment;
                setStrengthEquipment((current) =>
                  current.includes(equipment)
                    ? current.filter((entry) => entry !== equipment)
                    : [...current, equipment],
                );
                setExtrasMessage(null);
                setExtrasError(null);
              }}
            />
          </FieldGroup>
        ) : null}
        <PrimaryButton
          label={savingExtras ? "Saving..." : "Save strength defaults"}
          disabled={savingExtras || resetting || syncingHealthKit || signingOut}
          onPress={() =>
            void runExtras(async () => {
              await updateStrengthPreferences({
                enabled: strengthEnabled,
                equipment: strengthEnabled ? strengthEquipment : [],
              });
            }, "Strength defaults saved.")
          }
        />
      </Panel>

      <Panel title="Courses">
        <Text style={styles.bodyText}>Courses are shared across web and mobile plan generation.</Text>
        <FieldGroup label="Course name">
          <TextInput
            style={styles.input}
            value={courseName}
            onChangeText={setCourseName}
            placeholder="Park loop"
            placeholderTextColor="#7a848c"
          />
        </FieldGroup>
        <FieldGroup label="Distance">
          <View style={styles.timeInputRow}>
            <View style={styles.timeInputBlock}>
              <TextInput
                style={styles.input}
                value={courseDistanceValue}
                onChangeText={setCourseDistanceValue}
                keyboardType="decimal-pad"
                placeholder="1"
                placeholderTextColor="#7a848c"
              />
            </View>
            <View style={styles.timeInputBlock}>
              <ChoiceRow options={DISTANCE_UNITS} selected={courseDistanceUnit} onChange={(value) => setCourseDistanceUnit(value as DistanceUnit)} />
            </View>
          </View>
        </FieldGroup>
        <FieldGroup label="Surface">
          <ChoiceRow options={SURFACE_TYPES} selected={courseSurface} onChange={(value) => setCourseSurface(value as SurfaceType)} />
        </FieldGroup>
        <FieldGroup label="Notes">
          <TextInput
            style={[styles.input, styles.textArea]}
            value={courseNotes}
            onChangeText={setCourseNotes}
            multiline
            placeholder="Short description or landmarks"
            placeholderTextColor="#7a848c"
          />
        </FieldGroup>
        <PrimaryButton
          label={savingExtras ? "Saving..." : "Add course"}
          disabled={savingExtras || !courseName.trim() || !courseDistanceMeters}
          onPress={() =>
            void runExtras(async () => {
              await upsertCourse({
                name: courseName.trim(),
                distanceMeters: courseDistanceMeters!,
                distanceUnit: courseDistanceUnit,
                surface: courseSurface,
                notes: courseNotes.trim() || undefined,
              });
              setCourseName("");
              setCourseDistanceValue("1");
              setCourseDistanceUnit("miles");
              setCourseSurface("road");
              setCourseNotes("");
            }, "Course saved.")
          }
        />
        {settings?.courses.map((course) => (
          <View key={String(course._id)} style={styles.subtleBlock}>
            <Text style={styles.sectionCardTitle}>{course.name}</Text>
            <Text style={styles.helperText}>
              {course.distanceMeters}m · {course.distanceUnit} · {course.surface}
            </Text>
            {course.notes ? <Text style={styles.bodyText}>{course.notes}</Text> : null}
            <SecondaryButton
              label="Delete course"
              onPress={() =>
                void runExtras(async () => {
                  await deleteCourse({ courseId: course._id });
                }, "Course deleted.")
              }
              disabled={savingExtras}
            />
          </View>
        ))}
      </Panel>

      <Panel title="Race Results">
        <Text style={styles.bodyText}>Manage standalone race data from the same component model the web app uses.</Text>
        <FieldGroup label="Race label">
          <TextInput
            style={styles.input}
            value={raceLabel}
            onChangeText={setRaceLabel}
            placeholder="Spring 10K"
            placeholderTextColor="#7a848c"
          />
        </FieldGroup>
        <FieldGroup label="Race date">
          <TextInput
            style={styles.input}
            value={raceDate}
            onChangeText={setRaceDate}
            placeholder="2026-04-18"
            placeholderTextColor="#7a848c"
          />
        </FieldGroup>
        <FieldGroup label="Distance">
          <View style={styles.timeInputRow}>
            <View style={styles.timeInputBlock}>
              <TextInput
                style={styles.input}
                value={raceDistanceValue}
                onChangeText={setRaceDistanceValue}
                keyboardType="decimal-pad"
                placeholder="5"
                placeholderTextColor="#7a848c"
              />
            </View>
            <View style={styles.timeInputBlock}>
              <ChoiceRow options={DISTANCE_UNITS} selected={raceDistanceUnit} onChange={(value) => setRaceDistanceUnit(value as DistanceUnit)} />
            </View>
          </View>
        </FieldGroup>
        <FieldGroup label="Goal time">
          <TextInput
            style={styles.input}
            value={raceGoalTime}
            onChangeText={setRaceGoalTime}
            placeholder="45:00"
            placeholderTextColor="#7a848c"
          />
        </FieldGroup>
        <FieldGroup label="Actual time">
          <TextInput
            style={styles.input}
            value={raceActualTime}
            onChangeText={setRaceActualTime}
            placeholder="43:20"
            placeholderTextColor="#7a848c"
          />
        </FieldGroup>
        <PrimaryButton
          label={savingExtras ? "Saving..." : "Add race"}
          disabled={savingExtras || !raceLabel.trim() || !raceDate || !raceDistanceMeters}
          onPress={() =>
            void runExtras(async () => {
              await upsertRace({
                label: raceLabel.trim(),
                plannedDate: new Date(`${raceDate}T00:00:00`).getTime(),
                distanceMeters: raceDistanceMeters!,
                goalTimeSeconds: parseDurationText(raceGoalTime),
                actualTimeSeconds: parseDurationText(raceActualTime),
                isPrimaryGoal: false,
              });
              setRaceLabel("");
              setRaceDate("");
              setRaceDistanceValue("5");
              setRaceDistanceUnit("kilometers");
              setRaceGoalTime("");
              setRaceActualTime("");
            }, "Race saved.")
          }
        />
        {settings?.races.map((race) => (
          <View key={String(race._id)} style={styles.subtleBlock}>
            <Text style={styles.sectionCardTitle}>{race.label}</Text>
            <Text style={styles.helperText}>
              {new Date(race.plannedDate).toLocaleDateString()} · {race.distanceMeters}m
            </Text>
            {typeof race.goalTimeSeconds === "number" ? <Text style={styles.helperText}>Goal time: {race.goalTimeSeconds}s</Text> : null}
            {typeof race.actualTimeSeconds === "number" ? <Text style={styles.helperText}>Actual time: {race.actualTimeSeconds}s</Text> : null}
            {!race.isPrimaryGoal ? (
              <SecondaryButton
                label="Delete race"
                onPress={() =>
                  void runExtras(async () => {
                    await deleteRace({ raceId: race._id });
                  }, "Race deleted.")
                }
                disabled={savingExtras}
              />
            ) : (
              <Text style={styles.helperText}>Primary goal races stay attached to the plan flow.</Text>
            )}
          </View>
        ))}
      </Panel>

      <Panel title="Data Export">
        <Text style={styles.bodyText}>Share the current JSON export without leaving mobile settings.</Text>
        {extrasMessage ? <Text style={styles.helperText}>{extrasMessage}</Text> : null}
        {extrasError ? <Text style={styles.errorText}>{extrasError}</Text> : null}
        <PrimaryButton
          label="Share export JSON"
          disabled={!exportData || savingExtras}
          onPress={() =>
            void runExtras(async () => {
              await Share.share({
                message: JSON.stringify(exportData, null, 2),
              });
            }, "Export JSON opened in the share sheet.")
          }
        />
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
