import { ScrollView, Text } from "react-native";
import { useQuery } from "convex/react";

import { api, type Id } from "../../convex";
import { Panel, PrimaryButton } from "../../components/common";
import { styles } from "../../styles";

export function DashboardScreen({
  userId,
  userName,
  onCreatePlanPress,
}: {
  userId: Id<"users">;
  userName: string;
  onCreatePlanPress: () => void;
}) {
  const planState = useQuery(api.plans.getPlanState, { userId });
  const activePlan = planState?.activePlan ?? null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.kicker}>Dashboard</Text>
      <Text style={styles.heading}>Welcome back{userName ? `, ${userName}` : ""}</Text>
      <Panel title={activePlan ? "Active plan" : "No active plan"}>
        {activePlan ? (
          <Text style={styles.bodyText}>
            {activePlan.goal.label} - {activePlan.numberOfWeeks} weeks - peak {Math.round(activePlan.peakWeekVolume)}{" "}
            {activePlan.volumeMode === "time" ? "min" : "m"}
          </Text>
        ) : (
          <Text style={styles.bodyText}>Create your first plan to unlock weekly workouts and coach feedback.</Text>
        )}
        <PrimaryButton label="Create Plan" onPress={onCreatePlanPress} />
      </Panel>
      <Panel title="VDOT badge">
        <Text style={styles.bodyText}>
          VDOT initialization comes next after HealthKit and race-result ingestion are wired.
        </Text>
      </Panel>
    </ScrollView>
  );
}
