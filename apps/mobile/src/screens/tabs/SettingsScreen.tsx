import { useState } from "react";
import { Alert, ScrollView, Text } from "react-native";

import { Panel, PrimaryButton } from "../../components/common";
import { styles } from "../../styles";
import type { HealthKitSyncResult } from "../../types";

export function SettingsScreen({
  healthKitAuthorized,
  onResetApp,
  onSyncHealthKit,
}: {
  healthKitAuthorized: boolean;
  onResetApp: () => Promise<void>;
  onSyncHealthKit: () => Promise<HealthKitSyncResult>;
}) {
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [syncingHealthKit, setSyncingHealthKit] = useState(false);
  const [healthKitMessage, setHealthKitMessage] = useState<string | null>(null);
  const [healthKitError, setHealthKitError] = useState<string | null>(null);

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
      <Panel title="Ready fields">
        <Text style={styles.bodyText}>
          Profile, schedule, competitiveness, and personality are now persisted in Convex.
        </Text>
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
          disabled={syncingHealthKit || resetting}
        />
      </Panel>
      <Panel title="Data Management">
        <Text style={styles.bodyText}>Reset App wipes stored data and returns you to onboarding.</Text>
        {resetError ? <Text style={styles.errorText}>{resetError}</Text> : null}
        <PrimaryButton
          label={resetting ? "Resetting..." : "Reset App"}
          onPress={confirmReset}
          disabled={resetting || syncingHealthKit}
        />
      </Panel>
    </ScrollView>
  );
}
