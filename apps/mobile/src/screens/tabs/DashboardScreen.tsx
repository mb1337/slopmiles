import { ScrollView, Text } from "react-native";
import { useQuery } from "convex/react";
import { projectedRaceTime } from "@slopmiles/domain";

import { api } from "../../convex";
import { Panel, PrimaryButton } from "../../components/common";
import { styles } from "../../styles";

export function DashboardScreen({
  userName,
  currentVDOT,
  onCreatePlanPress,
}: {
  userName: string;
  currentVDOT: number | null;
  onCreatePlanPress: () => void;
}) {
  const planState = useQuery(api.plans.getPlanState, {});
  const activePlan = planState?.activePlan ?? null;
  const vdot = typeof currentVDOT === "number" ? currentVDOT : null;

  const formatRaceTime = (seconds: number): string => {
    const rounded = Math.max(0, Math.round(seconds));
    const hours = Math.floor(rounded / 3600);
    const minutes = Math.floor((rounded % 3600) / 60);
    const remainder = rounded % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
    }

    return `${minutes}:${String(remainder).padStart(2, "0")}`;
  };

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
        {vdot !== null ? (
          <>
            <Text style={styles.bodyText}>Current VDOT: {vdot.toFixed(1)}</Text>
            <Text style={styles.helperText}>5K prediction: {formatRaceTime(projectedRaceTime(vdot, 5000))}</Text>
            <Text style={styles.helperText}>10K prediction: {formatRaceTime(projectedRaceTime(vdot, 10000))}</Text>
            <Text style={styles.helperText}>Half Marathon prediction: {formatRaceTime(projectedRaceTime(vdot, 21097.5))}</Text>
            <Text style={styles.helperText}>Marathon prediction: {formatRaceTime(projectedRaceTime(vdot, 42195))}</Text>
          </>
        ) : (
          <Text style={styles.bodyText}>
            No VDOT yet. Use workout history or manual race entry in onboarding to set training paces.
          </Text>
        )}
      </Panel>
    </ScrollView>
  );
}
