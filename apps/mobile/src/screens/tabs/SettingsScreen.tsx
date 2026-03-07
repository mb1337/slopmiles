import { useEffect, useState } from "react";
import { Alert, ScrollView, Text, TextInput, View } from "react-native";
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

import { ChoiceRow, Counter, Panel, PrimaryButton, SecondaryButton, TagGrid } from "../../components/common";
import { styles } from "../../styles";
import type { HealthKitSyncResult } from "../../types";

function serializeAvailabilityWindows(value: RunningSchedule["availabilityWindows"]): Partial<Record<Weekday, string>> {
  const result: Partial<Record<Weekday, string>> = {};

  for (const day of WEEKDAYS) {
    const windows = value?.[day];
    if (!windows || windows.length === 0) {
      continue;
    }
    result[day] = windows.map((window) => `${window.start}-${window.end}`).join(", ");
  }

  return result;
}

function parseAvailabilityWindowText(raw: string): Array<{ start: string; end: string }> | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const parts = trimmed
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const windows: Array<{ start: string; end: string }> = [];
  for (const part of parts) {
    const match = /^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/.exec(part);
    if (!match) {
      return null;
    }

    const start = match[1];
    const end = match[2];
    if (!start || !end) {
      return null;
    }

    if (start >= end) {
      return null;
    }

    windows.push({ start, end });
  }

  return windows;
}

function buildAvailabilityWindows(
  preferredRunningDays: Weekday[],
  textByDay: Partial<Record<Weekday, string>>,
): RunningSchedule["availabilityWindows"] | null {
  const availabilityWindows: RunningSchedule["availabilityWindows"] = {};

  for (const day of preferredRunningDays) {
    const parsed = parseAvailabilityWindowText(textByDay[day] ?? "");
    if (parsed === null) {
      return null;
    }
    if (parsed.length > 0) {
      availabilityWindows[day] = parsed;
    }
  }

  return Object.keys(availabilityWindows).length > 0 ? availabilityWindows : {};
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
  const [name, setName] = useState(userName);
  const [selectedUnitPreference, setSelectedUnitPreference] = useState<UnitPreference>(unitPreference);
  const [selectedVolumePreference, setSelectedVolumePreference] = useState<VolumeMode>(volumePreference);
  const [selectedTrackAccess, setSelectedTrackAccess] = useState(trackAccess);
  const [preferredRunningDays, setPreferredRunningDays] = useState<Weekday[]>(runningSchedule.preferredRunningDays);
  const [runningDaysPerWeek, setRunningDaysPerWeek] = useState(runningSchedule.runningDaysPerWeek);
  const [preferredLongRunDay, setPreferredLongRunDay] = useState<Weekday | null>(runningSchedule.preferredLongRunDay);
  const [preferredQualityDays, setPreferredQualityDays] = useState<Weekday[]>(runningSchedule.preferredQualityDays);
  const [availabilityWindowText, setAvailabilityWindowText] = useState<Partial<Record<Weekday, string>>>(
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
    setAvailabilityWindowText(serializeAvailabilityWindows(runningSchedule.availabilityWindows));
  }, [runningSchedule]);

  useEffect(() => {
    setSelectedCompetitiveness(competitivenessLevel);
  }, [competitivenessLevel]);

  useEffect(() => {
    setSelectedPersonality(personality.name);
    setCustomPersonalityDescription(personality.name === "custom" ? personality.description : "");
  }, [personality]);

  const toggleDay = (day: Weekday) => {
    setPreferredRunningDays((previous) => {
      if (previous.includes(day)) {
        const next = previous.filter((item) => item !== day);
        if (preferredLongRunDay === day) {
          setPreferredLongRunDay(null);
        }
        setPreferredQualityDays((current) => current.filter((item) => item !== day));
        setAvailabilityWindowText((current) => {
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

  const clampedRunningDays = Math.max(1, Math.min(runningDaysPerWeek, Math.max(1, preferredRunningDays.length)));

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

    const availabilityWindows = buildAvailabilityWindows(preferredRunningDays, availabilityWindowText);
    if (availabilityWindows === null) {
      setScheduleError("Availability windows must use HH:MM-HH:MM entries separated by commas.");
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
      <Text style={styles.kicker}>Settings</Text>
      <Text style={styles.heading}>Profile and coaching</Text>

      <Panel title="Identity">
        <Text style={styles.label}>Display name</Text>
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
        {nameMessage ? <Text style={styles.helperText}>{nameMessage}</Text> : null}
        {nameError ? <Text style={styles.errorText}>{nameError}</Text> : null}
        <PrimaryButton
          label={savingName ? "Saving name..." : "Save display name"}
          onPress={() => {
            void runSaveName();
          }}
          disabled={savingName || name.trim().length === 0 || name.trim() === userName}
        />
      </Panel>

      <Panel title="Planning Preferences">
        <Text style={styles.bodyText}>Control how the coach frames volume and what workout formats it can assume.</Text>
        <Text style={styles.label}>Unit preference</Text>
        <ChoiceRow
          options={["system", "metric", "imperial"]}
          selected={selectedUnitPreference}
          onChange={(value) => {
            setSelectedUnitPreference(value as UnitPreference);
            setPreferencesMessage(null);
            setPreferencesError(null);
          }}
        />
        <Text style={styles.label}>Volume mode</Text>
        <ChoiceRow
          options={VOLUME_MODES}
          selected={selectedVolumePreference}
          onChange={(value) => {
            setSelectedVolumePreference(value as VolumeMode);
            setPreferencesMessage(null);
            setPreferencesError(null);
          }}
        />
        <Text style={styles.label}>Track access</Text>
        <ChoiceRow
          options={["yes", "no"]}
          selected={selectedTrackAccess ? "yes" : "no"}
          onChange={(value) => {
            setSelectedTrackAccess(value === "yes");
            setPreferencesMessage(null);
            setPreferencesError(null);
          }}
        />
        {preferencesMessage ? <Text style={styles.helperText}>{preferencesMessage}</Text> : null}
        {preferencesError ? <Text style={styles.errorText}>{preferencesError}</Text> : null}
        <PrimaryButton
          label={savingPreferences ? "Saving preferences..." : "Save planning preferences"}
          onPress={() => {
            void runSavePreferences();
          }}
          disabled={
            savingPreferences ||
            (selectedUnitPreference === unitPreference &&
              selectedVolumePreference === volumePreference &&
              selectedTrackAccess === trackAccess)
          }
        />
      </Panel>

      <Panel title="Running Schedule">
        <Text style={styles.label}>Preferred running days</Text>
        <TagGrid options={WEEKDAYS} selected={preferredRunningDays} onToggle={(day) => toggleDay(day as Weekday)} />

        <Text style={styles.label}>Target days per week</Text>
        <Counter value={clampedRunningDays} min={1} max={Math.max(1, preferredRunningDays.length)} onChange={setRunningDaysPerWeek} />

        <Text style={styles.label}>Preferred long run day</Text>
        <ChoiceRow
          options={["none", ...preferredRunningDays]}
          selected={preferredLongRunDay ?? "none"}
          onChange={(value) => {
            setPreferredLongRunDay(value === "none" ? null : (value as Weekday));
            setScheduleMessage(null);
            setScheduleError(null);
          }}
        />

        <Text style={styles.label}>Preferred quality days</Text>
        <TagGrid options={preferredRunningDays} selected={preferredQualityDays} onToggle={(day) => toggleQualityDay(day as Weekday)} />

        <Text style={styles.label}>Availability windows</Text>
        <Text style={styles.helperText}>Use `HH:MM-HH:MM`, comma-separated for multiple windows on the same day.</Text>
        {preferredRunningDays.map((day) => (
          <View key={day} style={styles.timeInputBlock}>
            <Text style={styles.helperText}>{day}</Text>
            <TextInput
              style={styles.input}
              value={availabilityWindowText[day] ?? ""}
              onChangeText={(value) => {
                setAvailabilityWindowText((current) => ({
                  ...current,
                  [day]: value,
                }));
                setScheduleMessage(null);
                setScheduleError(null);
              }}
              autoCapitalize="none"
              placeholder="06:00-07:30, 18:00-19:00"
              placeholderTextColor="#7a848c"
            />
          </View>
        ))}
        {scheduleMessage ? <Text style={styles.helperText}>{scheduleMessage}</Text> : null}
        {scheduleError ? <Text style={styles.errorText}>{scheduleError}</Text> : null}
        <PrimaryButton
          label={savingSchedule ? "Saving schedule..." : "Save running schedule"}
          onPress={() => {
            void runSaveSchedule();
          }}
          disabled={savingSchedule || preferredRunningDays.length === 0}
        />
      </Panel>

      <Panel title="Coach Style">
        <Text style={styles.label}>Competitiveness</Text>
        <ChoiceRow
          options={COMPETITIVENESS_LEVELS}
          selected={selectedCompetitiveness}
          onChange={(value) => {
            setSelectedCompetitiveness(value as CompetitivenessLevel);
            setCoachingMessage(null);
            setCoachingError(null);
          }}
        />
        <Text style={styles.label}>Personality</Text>
        <ChoiceRow
          options={PERSONALITY_PRESETS}
          selected={selectedPersonality}
          onChange={(value) => {
            setSelectedPersonality(value as Personality["name"]);
            setCoachingMessage(null);
            setCoachingError(null);
          }}
        />
        {selectedPersonality === "custom" ? (
          <>
            <Text style={styles.label}>Custom personality</Text>
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
          </>
        ) : null}
        {coachingMessage ? <Text style={styles.helperText}>{coachingMessage}</Text> : null}
        {coachingError ? <Text style={styles.errorText}>{coachingError}</Text> : null}
        <PrimaryButton
          label={savingCoaching ? "Saving coach style..." : "Save coach style"}
          onPress={() => {
            void runSaveCoaching();
          }}
          disabled={
            savingCoaching ||
            (selectedCompetitiveness === competitivenessLevel &&
              selectedPersonality === personality.name &&
              (selectedPersonality !== "custom" || customPersonalityDescription.trim() === personality.description))
          }
        />
      </Panel>

      <Panel title="HealthKit">
        <Text style={styles.bodyText}>
          Status: {healthKitAuthorized ? "Connected" : "Not connected"}. Connect or re-sync to import recent running workouts.
        </Text>
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

      <Panel title="Data Management">
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
    </ScrollView>
  );
}
