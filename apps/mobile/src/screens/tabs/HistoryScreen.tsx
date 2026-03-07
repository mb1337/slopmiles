import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useQuery } from "convex/react";
import type { UnitPreference } from "@slopmiles/domain";

import { api } from "../../convex";
import { WorkoutExecutionDetail } from "../../components/workoutExecution";
import { Panel } from "../../components/common";
import { styles } from "../../styles";
import {
  formatDistanceForDisplay,
  formatElevationForDisplay,
  formatPaceSecondsPerMeterForDisplay,
} from "../../units";

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

function formatMatchStatus(status: "matched" | "unmatched" | "needsReview" | null): string {
  switch (status) {
    case "matched":
      return "Matched";
    case "needsReview":
      return "Needs Review";
    case "unmatched":
      return "Unplanned";
    default:
      return "Pending";
  }
}

function matchBadgeStyle(status: "matched" | "unmatched" | "needsReview" | null) {
  switch (status) {
    case "matched":
      return styles.statusBadgeMatched;
    case "needsReview":
      return styles.statusBadgeNeedsReview;
    case "unmatched":
      return styles.statusBadgeUnmatched;
    default:
      return styles.statusBadgeUnmatched;
  }
}

export function HistoryScreen({
  unitPreference,
}: {
  unitPreference: UnitPreference;
}) {
  const importedWorkouts = useQuery(api.healthkit.listImportedWorkouts, {
    limit: 40,
  });
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);

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
        {importedWorkouts?.map((workout) => {
          const expanded = selectedWorkoutId === String(workout._id);
          const matchStatus = workout.execution?.matchStatus ?? null;

          return (
            <Pressable
              key={String(workout._id)}
              style={[
                styles.historyWorkoutBlock,
                expanded ? styles.workoutCardActive : null,
              ]}
              onPress={() =>
                setSelectedWorkoutId((current) =>
                  current === String(workout._id) ? null : String(workout._id),
                )
              }
            >
              <View style={styles.statusRow}>
                <Text style={styles.historyWorkoutTitle}>{formatWorkoutDate(workout.startedAt)}</Text>
                <Text style={[styles.statusBadge, matchBadgeStyle(matchStatus)]}>
                  {formatMatchStatus(matchStatus)}
                </Text>
              </View>
              <Text style={styles.helperText}>
                {formatDistanceForDisplay(workout.distanceMeters, unitPreference)} · {formatDuration(workout.durationSeconds)} · Pace{" "}
                {formatPaceSecondsPerMeterForDisplay(workout.rawPaceSecondsPerMeter ?? undefined, unitPreference)} · Avg HR{" "}
                {formatHeartRate(workout.averageHeartRate)}
              </Text>
              {workout.gradeAdjustedPaceSecondsPerMeter || workout.elevationAscentMeters || workout.elevationDescentMeters ? (
                <Text style={styles.helperText}>
                  {workout.gradeAdjustedPaceSecondsPerMeter
                    ? `GAP ${formatPaceSecondsPerMeterForDisplay(workout.gradeAdjustedPaceSecondsPerMeter, unitPreference)}`
                    : "GAP unavailable"}
                  {typeof workout.elevationAscentMeters === "number" || typeof workout.elevationDescentMeters === "number"
                    ? ` · Elevation +${formatElevationForDisplay(workout.elevationAscentMeters ?? 0, unitPreference)} / -${formatElevationForDisplay(
                        workout.elevationDescentMeters ?? 0,
                        unitPreference,
                      )}`
                    : ""}
                </Text>
              ) : null}
              {expanded ? (
                <>
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
                  {workout.execution ? (
                    <WorkoutExecutionDetail
                      executionId={workout.execution._id}
                      unitPreference={unitPreference}
                      allowMatchControls
                    />
                  ) : (
                    <Text style={styles.helperText}>
                      This imported run has not been reconciled yet. Re-sync HealthKit to build execution detail.
                    </Text>
                  )}
                </>
              ) : null}
            </Pressable>
          );
        })}
      </Panel>
    </ScrollView>
  );
}
