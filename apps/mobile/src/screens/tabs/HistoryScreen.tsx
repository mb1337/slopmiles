import { ScrollView, Text } from "react-native";

import { Panel } from "../../components/common";
import { styles } from "../../styles";

export function HistoryScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.kicker}>History</Text>
      <Text style={styles.heading}>Workout history</Text>
      <Panel title="Always available">
        <Text style={styles.bodyText}>History remains visible even when there is no active plan.</Text>
      </Panel>
    </ScrollView>
  );
}
