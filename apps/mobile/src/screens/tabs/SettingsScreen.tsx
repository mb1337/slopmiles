import { useEffect, useState } from "react";
import { Alert, ScrollView, Text, TextInput } from "react-native";
import type { UnitPreference } from "@slopmiles/domain";
import { useAuthActions } from "@convex-dev/auth/react";

import { ChoiceRow, Panel, PrimaryButton, SecondaryButton } from "../../components/common";
import { styles } from "../../styles";
import type { HealthKitSyncResult } from "../../types";

export function SettingsScreen({
  userName,
  unitPreference,
  healthKitAuthorized,
  onResetApp,
  onUpdateName,
  onUpdateUnitPreference,
  onSyncHealthKit,
}: {
  userName: string;
  unitPreference: UnitPreference;
  healthKitAuthorized: boolean;
  onResetApp: () => Promise<void>;
  onUpdateName: (name: string) => Promise<void>;
  onUpdateUnitPreference: (unitPreference: UnitPreference) => Promise<void>;
  onSyncHealthKit: () => Promise<HealthKitSyncResult>;
}) {
  const { signOut } = useAuthActions();
  const [name, setName] = useState(userName);
  const [savingName, setSavingName] = useState(false);
  const [nameMessage, setNameMessage] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [selectedUnitPreference, setSelectedUnitPreference] = useState<UnitPreference>(unitPreference);
  const [savingUnitPreference, setSavingUnitPreference] = useState(false);
  const [unitPreferenceMessage, setUnitPreferenceMessage] = useState<string | null>(null);
  const [unitPreferenceError, setUnitPreferenceError] = useState<string | null>(null);
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
  }, [unitPreference]);

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

  const runSaveUnitPreference = async () => {
    setSavingUnitPreference(true);
    setUnitPreferenceError(null);
    setUnitPreferenceMessage(null);
    try {
      await onUpdateUnitPreference(selectedUnitPreference);
      setUnitPreferenceMessage("Unit preference updated.");
    } catch (error) {
      setUnitPreferenceError(String(error));
    } finally {
      setSavingUnitPreference(false);
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
      "This permanently deletes your profile data, plans, and onboarding progress, then signs you out.",
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
      <Text style={styles.heading}>Core settings scaffold</Text>
      <Panel title="Preferences">
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
          disabled={
            savingName ||
            savingUnitPreference ||
            resetting ||
            syncingHealthKit ||
            signingOut ||
            name.trim().length === 0 ||
            name.trim() === userName
          }
        />
        <Text style={styles.bodyText}>
          Choose how distances and paces are displayed across the app.
        </Text>
        <Text style={styles.label}>Unit preference</Text>
        <ChoiceRow
          options={["system", "metric", "imperial"]}
          selected={selectedUnitPreference}
          onChange={(value) => {
            setSelectedUnitPreference(value as UnitPreference);
            setUnitPreferenceMessage(null);
            setUnitPreferenceError(null);
          }}
        />
        {unitPreferenceMessage ? <Text style={styles.helperText}>{unitPreferenceMessage}</Text> : null}
        {unitPreferenceError ? <Text style={styles.errorText}>{unitPreferenceError}</Text> : null}
        <PrimaryButton
          label={savingUnitPreference ? "Saving units..." : "Save unit preference"}
          onPress={() => {
            void runSaveUnitPreference();
          }}
          disabled={
            savingName ||
            savingUnitPreference ||
            resetting ||
            syncingHealthKit ||
            signingOut ||
            selectedUnitPreference === unitPreference
          }
        />
      </Panel>
      <Panel title="HealthKit">
        <Text style={styles.bodyText}>
          Status: {healthKitAuthorized ? "Connected" : "Not connected"}. Connect or re-sync to import recent running
          workouts.
        </Text>
        {healthKitMessage ? <Text style={styles.helperText}>{healthKitMessage}</Text> : null}
        {healthKitError ? <Text style={styles.errorText}>{healthKitError}</Text> : null}
        <PrimaryButton
          label={syncingHealthKit ? "Syncing HealthKit..." : healthKitAuthorized ? "Re-sync HealthKit" : "Connect HealthKit"}
          onPress={() => {
            void runHealthKitSync();
          }}
          disabled={syncingHealthKit || resetting || savingName || savingUnitPreference || signingOut}
        />
      </Panel>
      <Panel title="Data Management">
        <Text style={styles.bodyText}>Reset App wipes stored data, signs you out, and restarts onboarding on next sign-in.</Text>
        {resetError ? <Text style={styles.errorText}>{resetError}</Text> : null}
        <PrimaryButton
          label={resetting ? "Resetting..." : "Reset App"}
          onPress={confirmReset}
          disabled={resetting || syncingHealthKit || savingName || savingUnitPreference || signingOut}
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
          disabled={signingOut || resetting || syncingHealthKit || savingName || savingUnitPreference}
        />
      </Panel>
    </ScrollView>
  );
}
