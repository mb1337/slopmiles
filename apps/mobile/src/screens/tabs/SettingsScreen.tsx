import { ScrollView, Text } from "react-native";

import { Panel } from "../../components/common";
import { styles } from "../../styles";

export function SettingsScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.kicker}>Settings</Text>
      <Text style={styles.heading}>Core settings scaffold</Text>
      <Panel title="Ready fields">
        <Text style={styles.bodyText}>
          Profile, schedule, competitiveness, and personality are now persisted in Convex.
        </Text>
      </Panel>
    </ScrollView>
  );
}
