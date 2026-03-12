import { ScrollView, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Panel } from "../components/common";
import { styles } from "../styles";

export function MissingConfigScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.kicker}>Configuration</Text>
        <Text style={styles.heading}>Convex URL missing</Text>
        <Panel title="Set CONVEX_URL">
          <Text style={styles.bodyText}>
            Add CONVEX_URL to the repo root .env.local so the web and mobile apps can share the
            same Convex deployment URL.
          </Text>
        </Panel>
      </ScrollView>
    </SafeAreaView>
  );
}
