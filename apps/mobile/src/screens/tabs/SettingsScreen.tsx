import { useState } from "react";
import { Alert, ScrollView, Text } from "react-native";

import { Panel, PrimaryButton } from "../../components/common";
import { styles } from "../../styles";

export function SettingsScreen({ onResetApp }: { onResetApp: () => Promise<void> }) {
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

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
      <Panel title="Data Management">
        <Text style={styles.bodyText}>Reset App wipes stored data and returns you to onboarding.</Text>
        {resetError ? <Text style={styles.errorText}>{resetError}</Text> : null}
        <PrimaryButton label={resetting ? "Resetting..." : "Reset App"} onPress={confirmReset} disabled={resetting} />
      </Panel>
    </ScrollView>
  );
}
