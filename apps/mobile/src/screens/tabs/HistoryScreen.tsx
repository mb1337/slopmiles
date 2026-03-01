import { ScrollView, Text, View } from "react-native";
import { useQuery } from "convex/react";
import type { UnitPreference } from "@slopmiles/domain";

import { api } from "../../convex";
import { Panel } from "../../components/common";
import { styles } from "../../styles";
import { formatDistanceForDisplay } from "../../units";

function formatDuration(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = rounded % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatHeartRate(heartRate?: number): string {
  return typeof heartRate === "number" ? `${Math.round(heartRate)} bpm` : "-";
}

function formatWorkoutDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function HistoryScreen({
  unitPreference,
}: {
  unitPreference: UnitPreference;
}) {
  const importedWorkouts = useQuery(api.healthkit.listImportedWorkouts, {
    limit: 40,
  });

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.kicker}>History</Text>
      <Text style={styles.heading}>Workout history</Text>
      <Panel title="Always available">
        <Text style={styles.bodyText}>History remains visible even when there is no active plan.</Text>
      </Panel>
      <Panel title="Recent HealthKit workouts">
        {importedWorkouts === undefined ? <Text style={styles.helperText}>Loading workout history...</Text> : null}
        {importedWorkouts && importedWorkouts.length === 0 ? (
          <Text style={styles.bodyText}>No imported workouts yet. Connect or re-sync HealthKit in Settings.</Text>
        ) : null}
        {importedWorkouts?.map((workout) => (
          <View key={String(workout._id)} style={styles.historyWorkoutBlock}>
            <Text style={styles.historyWorkoutTitle}>{formatWorkoutDate(workout.startedAt)}</Text>
            <Text style={styles.helperText}>
              {formatDistanceForDisplay(workout.distanceMeters, unitPreference)} · {formatDuration(workout.durationSeconds)} · Avg HR{" "}
              {formatHeartRate(workout.averageHeartRate)}
            </Text>
            {workout.intervalChains?.length ? (
              <View style={styles.historyIntervalList}>
                {workout.intervalChains.map((chain) => (
                  <View key={`${workout._id}:chain:${chain.chainIndex}`} style={styles.historyChainBlock}>
                    <Text style={styles.historyChainTitle}>Chain {chain.chainIndex}</Text>
                    <Text style={styles.helperText}>
                      {chain.intervalCount} intervals · {formatDuration(chain.durationSeconds)} ·{" "}
                      {formatDistanceForDisplay(chain.distanceMeters, unitPreference)}
                    </Text>
                    {chain.intervals.map((interval, index) => (
                      <View
                        key={`${workout._id}:chain:${chain.chainIndex}:interval:${interval.startedAt}:${index}`}
                        style={styles.historyIntervalRow}
                      >
                        <Text style={styles.historyIntervalLabel}>
                          {interval.type === "lap" ? "Lap" : "Segment"} {index + 1}
                        </Text>
                        <Text style={styles.historyIntervalValue}>
                          {formatDistanceForDisplay(interval.distanceMeters, unitPreference)} · {formatDuration(interval.durationSeconds)} ·{" "}
                          {formatHeartRate(interval.averageHeartRate)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ))}
      </Panel>
    </ScrollView>
  );
}
