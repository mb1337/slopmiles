import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useQuery } from "convex/react";
import type { UnitPreference } from "@slopmiles/domain";

import { api, type Id } from "../../convex";
import {
  ChoiceRow,
  MetricGrid,
  MetricStat,
  PrimaryButton,
  ScreenHeader,
  SectionCard,
  SecondaryButton,
  StatusBanner,
} from "../../components/common";
import { WorkoutExecutionDetail } from "../../components/workoutExecution";
import { styles } from "../../styles";
import type { HistoryRoute } from "../../types";
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

function formatWorkoutDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatMatchStatus(status: "matched" | "needsReview" | "unplanned"): string {
  switch (status) {
    case "matched":
      return "Matched";
    case "needsReview":
      return "Needs Review";
    case "unplanned":
      return "Unplanned";
    default:
      return status;
  }
}

function normalizeMatchStatus(value?: string | null): "matched" | "needsReview" | "unplanned" {
  if (value === "matched") {
    return "matched";
  }

  if (value === "needsReview") {
    return "needsReview";
  }

  return "unplanned";
}

export function HistoryScreen({
  unitPreference,
  route,
  onRouteChange,
}: {
  unitPreference: UnitPreference;
  route: HistoryRoute;
  onRouteChange: (route: HistoryRoute) => void;
}) {
  const [filter, setFilter] = useState<"all" | "matched" | "needsReview" | "unplanned">("all");
  const historyFeed = useQuery(api.mobileUx.getHistoryFeed, {
    filter,
    limit: 60,
  });
  const importedWorkouts = useQuery(api.healthkit.listImportedWorkouts, {
    limit: 100,
  });

  const selectedWorkout =
    route.screen === "detail"
      ? importedWorkouts?.find((workout) => workout._id === route.healthKitWorkoutId) ?? null
      : null;

  if (route.screen === "detail") {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <ScreenHeader
          eyebrow="History"
          title={selectedWorkout ? formatWorkoutDate(selectedWorkout.startedAt) : "Workout detail"}
          subtitle="Review summary first, then use the execution block to reconcile and check in."
          actionLabel="Back to feed"
          onAction={() => onRouteChange({ screen: "feed" })}
        />

        {!selectedWorkout ? <StatusBanner message="Loading workout detail..." /> : null}

        {selectedWorkout ? (
          <>
            <SectionCard title="Run summary" description={formatMatchStatus(normalizeMatchStatus(selectedWorkout.execution?.matchStatus))}>
              <MetricGrid>
                <MetricStat label="Distance" value={formatDistanceForDisplay(selectedWorkout.distanceMeters, unitPreference)} />
                <MetricStat label="Duration" value={formatDuration(selectedWorkout.durationSeconds)} />
                <MetricStat
                  label="Pace"
                  value={formatPaceSecondsPerMeterForDisplay(selectedWorkout.rawPaceSecondsPerMeter ?? undefined, unitPreference)}
                />
                <MetricStat
                  label="Avg HR"
                  value={typeof selectedWorkout.averageHeartRate === "number" ? `${Math.round(selectedWorkout.averageHeartRate)} bpm` : "-"}
                />
              </MetricGrid>
              {typeof selectedWorkout.elevationAscentMeters === "number" || typeof selectedWorkout.elevationDescentMeters === "number" ? (
                <Text style={styles.helperText}>
                  Elevation +{formatElevationForDisplay(selectedWorkout.elevationAscentMeters ?? 0, unitPreference)} / -
                  {formatElevationForDisplay(selectedWorkout.elevationDescentMeters ?? 0, unitPreference)}
                </Text>
              ) : null}
            </SectionCard>

            {selectedWorkout.execution ? (
              <SectionCard title="Reconcile and review" description="Match controls, check-in, and coach feedback stay together here.">
                <WorkoutExecutionDetail
                  executionId={selectedWorkout.execution._id as Id<"workoutExecutions">}
                  unitPreference={unitPreference}
                  allowMatchControls
                />
              </SectionCard>
            ) : (
              <SectionCard title="Reconcile and review" description="Re-sync HealthKit if this run never received an execution record.">
                <Text style={styles.bodyText}>This imported run does not have execution detail yet.</Text>
              </SectionCard>
            )}

            {selectedWorkout.intervalChains?.length ? (
              <SectionCard title="Segment analysis" description="Expanded detail stays below the summary and match actions.">
                {selectedWorkout.intervalChains.map((chain) => (
                  <View key={`${String(selectedWorkout._id)}-${chain.chainIndex}`} style={styles.historyChainBlock}>
                    <Text style={styles.historyChainTitle}>Chain {chain.chainIndex}</Text>
                    <Text style={styles.helperText}>
                      {chain.intervalCount} intervals · {formatDuration(chain.durationSeconds)} ·{" "}
                      {formatDistanceForDisplay(chain.distanceMeters, unitPreference)}
                    </Text>
                    {chain.intervals.map((interval, index) => (
                      <View
                        key={`${String(selectedWorkout._id)}-${chain.chainIndex}-${interval.startedAt}-${index}`}
                        style={styles.historyIntervalRow}
                      >
                        <Text style={styles.historyIntervalLabel}>{interval.type === "lap" ? "Lap" : "Segment"} {index + 1}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.historyIntervalValue}>
                            {formatDistanceForDisplay(interval.distanceMeters, unitPreference)} · {formatDuration(interval.durationSeconds)}
                          </Text>
                          <Text style={styles.helperText}>
                            Pace {formatPaceSecondsPerMeterForDisplay(interval.rawPaceSecondsPerMeter ?? undefined, unitPreference)}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ))}
              </SectionCard>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader
        eyebrow="History"
        title="Workout history"
        subtitle="Filter the feed to the runs that need action, then open one compact detail screen per workout."
      />

      {historyFeed === undefined ? <StatusBanner message="Loading workout history..." /> : null}

      <SectionCard title="Feed filters" description="Counts update before you drill into a workout.">
        <MetricGrid>
          <MetricStat label="Matched" value={String(historyFeed?.counts.matched ?? 0)} />
          <MetricStat label="Needs review" value={String(historyFeed?.counts.needsReview ?? 0)} />
          <MetricStat label="Unplanned" value={String(historyFeed?.counts.unplanned ?? 0)} />
        </MetricGrid>
        <ChoiceRow
          options={["all", "matched", "needsReview", "unplanned"]}
          selected={filter}
          onChange={(value) => setFilter(value as "all" | "matched" | "needsReview" | "unplanned")}
        />
      </SectionCard>

      <SectionCard title="Recent runs" description="Tap through for matching, check-in, and segment detail.">
        {historyFeed?.items.length ? (
          historyFeed.items.map((workout) => (
            <View key={String(workout._id)} style={styles.historyWorkoutBlock}>
              <View style={styles.statusRow}>
                <Text style={styles.historyWorkoutTitle}>{formatWorkoutDate(workout.startedAt)}</Text>
                <Text
                  style={[
                    styles.statusBadge,
                    workout.status === "matched"
                      ? styles.statusBadgeMatched
                      : workout.status === "needsReview"
                        ? styles.statusBadgeNeedsReview
                        : styles.statusBadgeUnmatched,
                  ]}
                >
                  {formatMatchStatus(workout.status)}
                </Text>
              </View>
              <Text style={styles.helperText}>
                {formatDistanceForDisplay(workout.distanceMeters, unitPreference)} · {formatDuration(workout.durationSeconds)} · Pace{" "}
                {formatPaceSecondsPerMeterForDisplay(workout.rawPaceSecondsPerMeter ?? undefined, unitPreference)}
              </Text>
              <PrimaryButton
                label={workout.status === "matched" ? "Open run detail" : "Review run"}
                onPress={() => onRouteChange({ screen: "detail", healthKitWorkoutId: workout._id })}
              />
            </View>
          ))
        ) : (
          <Text style={styles.bodyText}>No workouts match this filter yet.</Text>
        )}
      </SectionCard>
    </ScrollView>
  );
}
