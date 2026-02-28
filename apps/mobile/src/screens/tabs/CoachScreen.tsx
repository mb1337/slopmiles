import { ScrollView, Text } from "react-native";

import { Panel } from "../../components/common";
import { styles } from "../../styles";

export function CoachScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.kicker}>Coach</Text>
      <Text style={styles.heading}>Coach chat scaffold</Text>
      <Panel title="Available without plan">
        <Text style={styles.bodyText}>Coach conversation remains available and can suggest creating a plan.</Text>
      </Panel>
    </ScrollView>
  );
}
