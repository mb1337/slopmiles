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
        <Panel title="Set EXPO_PUBLIC_CONVEX_URL">
          <Text style={styles.bodyText}>
            Create apps/mobile/.env and set EXPO_PUBLIC_CONVEX_URL to your Convex deployment URL.
          </Text>
        </Panel>
      </ScrollView>
    </SafeAreaView>
  );
}
