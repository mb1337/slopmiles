import { useEffect, useState } from "react";
import { Alert, ScrollView, Text } from "react-native";
import type { UnitPreference } from "@slopmiles/domain";

import { ChoiceRow, Panel, PrimaryButton } from "../../components/common";
import { styles } from "../../styles";
import type { HealthKitSyncResult } from "../../types";

export function SettingsScreen({
  unitPreference,
  healthKitAuthorized,
  onResetApp,
  onUpdateUnitPreference,
  onSyncHealthKit,
}: {
  unitPreference: UnitPreference;
  healthKitAuthorized: boolean;
  onResetApp: () => Promise<void>;
  onUpdateUnitPreference: (unitPreference: UnitPreference) => Promise<void>;
  onSyncHealthKit: () => Promise<HealthKitSyncResult>;
}) {
  const [selectedUnitPreference, setSelectedUnitPreference] = useState<UnitPreference>(unitPreference);
  const [savingUnitPreference, setSavingUnitPreference] = useState(false);
  const [unitPreferenceMessage, setUnitPreferenceMessage] = useState<string | null>(null);
  const [unitPreferenceError, setUnitPreferenceError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [syncingHealthKit, setSyncingHealthKit] = useState(false);
  const [healthKitMessage, setHealthKitMessage] = useState<string | null>(null);
  const [healthKitError, setHealthKitError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedUnitPreference(unitPreference);
  }, [unitPreference]);

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

  const confirmReset = () => {
    Alert.alert(
      "Reset app data?",
      "This permanently deletes your profile data, plans, and onboarding progress, then restarts onboarding.",
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
            savingUnitPreference || resetting || syncingHealthKit || selectedUnitPreference === unitPreference
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
          disabled={syncingHealthKit || resetting || savingUnitPreference}
        />
      </Panel>
      <Panel title="Data Management">
        <Text style={styles.bodyText}>Reset App wipes stored data and returns you to onboarding.</Text>
        {resetError ? <Text style={styles.errorText}>{resetError}</Text> : null}
        <PrimaryButton
          label={resetting ? "Resetting..." : "Reset App"}
          onPress={confirmReset}
          disabled={resetting || syncingHealthKit || savingUnitPreference}
        />
      </Panel>
    </ScrollView>
  );
}
