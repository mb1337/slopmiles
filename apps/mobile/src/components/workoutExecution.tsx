import { useEffect, useMemo, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import {
  EFFORT_MODIFIERS,
  formatDateKeyForDisplay,
  formatDistanceForDisplay,
  formatDurationClock,
  formatElevationForDisplay,
  formatEffortModifierLabel,
  formatPaceSecondsPerMeterForDisplay,
  formatWorkoutTypeLabel,
  type EffortModifier,
  type UnitPreference,
} from "@slopmiles/domain";

import { api, type Id } from "../convex";
import { ChoiceRow, PrimaryButton, SecondaryButton, TagGrid } from "./common";
import { styles } from "../styles";

const RPE_OPTIONS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"] as const;

function formatHeartRate(heartRate?: number): string {
  return typeof heartRate === "number" ? `${Math.round(heartRate)} bpm` : "-";
}

function formatMatchStatus(status: "matched" | "unmatched" | "needsReview"): string {
  switch (status) {
    case "matched":
      return "Matched";
    case "needsReview":
      return "Needs Review";
    case "unmatched":
      return "Unplanned";
    default:
      return status;
  }
}

function matchBadgeStyle(status: "matched" | "unmatched" | "needsReview") {
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

function formatPlannedTarget(
  segment: {
    plannedSeconds: number | null;
    plannedMeters: number | null;
    plannedPaceSecondsPerMeter: number | null;
  },
  unitPreference: UnitPreference,
): string {
  if (segment.plannedSeconds === null && segment.plannedMeters === null) {
    return "Extra / unmatched rep";
  }

  const volume =
    typeof segment.plannedSeconds === "number"
      ? formatDurationClock(segment.plannedSeconds)
      : formatDistanceForDisplay(segment.plannedMeters ?? undefined, unitPreference);
  const pace = formatPaceSecondsPerMeterForDisplay(segment.plannedPaceSecondsPerMeter ?? undefined, unitPreference);
  return `${volume} @ ${pace}`;
}

function formatActualRep(
  rep: {
    actualSeconds: number | null;
    actualMeters: number | null;
    actualPaceSecondsPerMeter: number | null;
    actualPaceSource: "gap" | "raw" | null;
  },
  unitPreference: UnitPreference,
): string {
  const volume = [
    typeof rep.actualSeconds === "number" ? formatDurationClock(rep.actualSeconds) : null,
    typeof rep.actualMeters === "number" ? formatDistanceForDisplay(rep.actualMeters, unitPreference) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const pace = formatPaceSecondsPerMeterForDisplay(rep.actualPaceSecondsPerMeter ?? undefined, unitPreference);
  const paceLabel = rep.actualPaceSource === "gap" ? `GAP ${pace}` : pace;
  return [volume, paceLabel].filter(Boolean).join(" · ");
}

export function WorkoutExecutionDetail({
  executionId,
  unitPreference,
  allowMatchControls = false,
}: {
  executionId: Id<"workoutExecutions">;
  unitPreference: UnitPreference;
  allowMatchControls?: boolean;
}) {
  const detail = useQuery(api.workoutDetail.getExecutionDetail, {
    executionId,
  });
  const candidateHealthKitWorkoutId = detail?.importedWorkout._id;
  const candidates = useQuery(
    api.workoutDetail.getMatchCandidates,
    allowMatchControls && candidateHealthKitWorkoutId
      ? {
          healthKitWorkoutId: candidateHealthKitWorkoutId,
        }
      : "skip",
  );
  const submitCheckIn = useMutation(api.workoutDetail.submitCheckIn);
  const linkImportedWorkout = useMutation(api.workoutDetail.linkImportedWorkout);
  const unlinkImportedWorkout = useMutation(api.workoutDetail.unlinkImportedWorkout);

  const [rpe, setRpe] = useState<number | null>(null);
  const [modifiers, setModifiers] = useState<EffortModifier[]>([]);
  const [customModifierText, setCustomModifierText] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [linkingWorkoutId, setLinkingWorkoutId] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!detail) {
      return;
    }

    setRpe(detail.execution.rpe ?? null);
    setModifiers(detail.execution.modifiers);
    setCustomModifierText(detail.execution.customModifierText ?? "");
    setNotes(detail.execution.notes ?? "");
  }, [
    detail?.execution._id,
    detail?.execution.rpe,
    detail?.execution.modifiers,
    detail?.execution.customModifierText,
    detail?.execution.notes,
  ]);

  const linkedWorkoutSummary = useMemo(() => {
    if (!detail?.plannedWorkout) {
      return null;
    }

    return `${formatDateKeyForDisplay(detail.plannedWorkout.scheduledDateKey)} · ${formatWorkoutTypeLabel(detail.plannedWorkout.type)}`;
  }, [detail?.plannedWorkout]);

  const toggleModifier = (modifier: string) => {
    const typedModifier = modifier as EffortModifier;
    setModifiers((current) =>
      current.includes(typedModifier)
        ? current.filter((value) => value !== typedModifier)
        : [...current, typedModifier],
    );
  };

  const onSubmitCheckIn = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await submitCheckIn({
        executionId,
        rpe: rpe ?? undefined,
        modifiers,
        customModifierText: customModifierText.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setMessage(detail?.execution.checkInStatus === "submitted" ? "Check-in updated." : "Check-in saved.");
    } catch (submitError) {
      setError(String(submitError));
    } finally {
      setSaving(false);
    }
  };

  const onLinkWorkout = async (plannedWorkoutId: Id<"workouts">) => {
    if (!candidateHealthKitWorkoutId) {
      return;
    }

    setLinkingWorkoutId(String(plannedWorkoutId));
    setError(null);
    setMessage(null);
    try {
      await linkImportedWorkout({
        healthKitWorkoutId: candidateHealthKitWorkoutId,
        plannedWorkoutId,
      });
      setMessage("Imported run linked to planned workout.");
    } catch (linkError) {
      setError(String(linkError));
    } finally {
      setLinkingWorkoutId(null);
    }
  };

  const onUnlinkWorkout = async () => {
    setUnlinking(true);
    setError(null);
    setMessage(null);
    try {
      await unlinkImportedWorkout({
        executionId,
      });
      setMessage("Imported run unlinked from plan.");
    } catch (unlinkError) {
      setError(String(unlinkError));
    } finally {
      setUnlinking(false);
    }
  };

  if (detail === undefined) {
    return <Text style={styles.helperText}>Loading workout execution...</Text>;
  }

  const { execution, importedWorkout } = detail;
  const rawPace = formatPaceSecondsPerMeterForDisplay(importedWorkout.rawPaceSecondsPerMeter ?? undefined, unitPreference);
  const gapPace = formatPaceSecondsPerMeterForDisplay(
    importedWorkout.gradeAdjustedPaceSecondsPerMeter ?? undefined,
    unitPreference,
  );
  const elevationSummary =
    typeof importedWorkout.elevationAscentMeters === "number" || typeof importedWorkout.elevationDescentMeters === "number"
      ? `+${formatElevationForDisplay(importedWorkout.elevationAscentMeters ?? 0, unitPreference)} / -${formatElevationForDisplay(
          importedWorkout.elevationDescentMeters ?? 0,
          unitPreference,
        )}`
      : null;

  return (
    <View style={styles.executionBlock}>
      <View style={styles.statusRow}>
        <Text style={styles.executionHeading}>Actual Run</Text>
        <Text style={[styles.statusBadge, matchBadgeStyle(execution.matchStatus)]}>
          {formatMatchStatus(execution.matchStatus)}
        </Text>
      </View>

      <View style={styles.metricGrid}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Distance</Text>
          <Text style={styles.metricValue}>{formatDistanceForDisplay(importedWorkout.distanceMeters, unitPreference)}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Duration</Text>
          <Text style={styles.metricValue}>{formatDurationClock(importedWorkout.durationSeconds)}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Pace</Text>
          <Text style={styles.metricValue}>{rawPace}</Text>
        </View>
        {importedWorkout.gradeAdjustedPaceSecondsPerMeter ? (
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>GAP</Text>
            <Text style={styles.metricValue}>{gapPace}</Text>
          </View>
        ) : null}
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Avg HR</Text>
          <Text style={styles.metricValue}>{formatHeartRate(importedWorkout.averageHeartRate)}</Text>
        </View>
        {elevationSummary ? (
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Elevation</Text>
            <Text style={styles.metricValue}>{elevationSummary}</Text>
          </View>
        ) : null}
      </View>

      {linkedWorkoutSummary ? (
        <View style={styles.subtleBlock}>
          <Text style={styles.label}>Linked workout</Text>
          <Text style={styles.bodyText}>{linkedWorkoutSummary}</Text>
        </View>
      ) : null}

      {detail.segmentComparisons.length > 0 ? (
        <View style={styles.executionSection}>
          <Text style={styles.executionSectionTitle}>Planned vs Actual Reps</Text>
          {detail.segmentComparisons.map((segment) => (
            <View key={`${executionId}:segment:${segment.plannedSegmentOrder}`} style={styles.subtleBlock}>
              <Text style={styles.label}>
                {segment.plannedLabel} {segment.plannedPaceZone ? `(${segment.plannedPaceZone})` : ""}
              </Text>
              <Text style={styles.helperText}>
                Adherence {Math.round(segment.adherenceScore * 100)}%
                {segment.inferred ? " · includes inferred rep boundaries" : ""}
              </Text>
              {segment.reps.map((rep) => (
                <View
                  key={`${executionId}:segment:${segment.plannedSegmentOrder}:rep:${rep.repIndex}`}
                  style={styles.historyIntervalRow}
                >
                  <Text style={styles.historyIntervalLabel}>Rep {rep.repIndex}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.helperText}>Planned: {formatPlannedTarget(rep, unitPreference)}</Text>
                    <Text style={styles.helperText}>Actual: {formatActualRep(rep, unitPreference)}</Text>
                  </View>
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.executionSection}>
        <Text style={styles.executionSectionTitle}>Check-In</Text>
        <Text style={styles.label}>RPE (optional)</Text>
        <ChoiceRow
          options={RPE_OPTIONS}
          selected={rpe === null ? "" : String(rpe)}
          onChange={(value) => setRpe(Number(value))}
        />
        {rpe !== null ? <SecondaryButton label="Clear RPE" onPress={() => setRpe(null)} /> : null}

        <Text style={styles.label}>Effort modifiers</Text>
        <TagGrid
          options={EFFORT_MODIFIERS.map((modifier) => formatEffortModifierLabel(modifier))}
          selected={modifiers.map((modifier) => formatEffortModifierLabel(modifier))}
          onToggle={(label) => {
            const modifier = EFFORT_MODIFIERS.find((entry) => formatEffortModifierLabel(entry) === label);
            if (modifier) {
              toggleModifier(modifier);
            }
          }}
        />

        <Text style={styles.label}>Custom context (optional)</Text>
        <TextInput
          style={styles.input}
          value={customModifierText}
          onChangeText={setCustomModifierText}
          placeholder="Anything else the coach should know?"
          placeholderTextColor="#7a848c"
        />

        <Text style={styles.label}>Notes (optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={notes}
          onChangeText={setNotes}
          multiline
          placeholder="How did the run feel?"
          placeholderTextColor="#7a848c"
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {message ? <Text style={styles.helperText}>{message}</Text> : null}
        <PrimaryButton
          label={saving ? "Saving Check-In..." : execution.checkInStatus === "submitted" ? "Update Check-In" : "Save Check-In"}
          onPress={() => void onSubmitCheckIn()}
          disabled={saving}
        />
      </View>

      <View style={styles.executionSection}>
        <Text style={styles.executionSectionTitle}>Coach Feedback</Text>
        {execution.feedback.commentary ? (
          <Text style={styles.bodyText}>{execution.feedback.commentary}</Text>
        ) : (
          <Text style={styles.helperText}>Coach feedback pending.</Text>
        )}
        {execution.feedback.adjustments.length > 0
          ? execution.feedback.adjustments.map((adjustment, index) => (
              <Text key={`${executionId}:adjustment:${index}`} style={styles.helperText}>
                {adjustment}
              </Text>
            ))
          : null}
      </View>

      {allowMatchControls ? (
        <View style={styles.executionSection}>
          <Text style={styles.executionSectionTitle}>Plan Match</Text>
          {execution.matchStatus === "matched" && detail.plannedWorkout ? (
            <>
              <Text style={styles.bodyText}>{linkedWorkoutSummary}</Text>
              <SecondaryButton
                label={unlinking ? "Unlinking..." : "Unlink from Plan"}
                onPress={() => void onUnlinkWorkout()}
                disabled={unlinking}
              />
            </>
          ) : candidates === undefined ? (
            <Text style={styles.helperText}>Loading candidate workouts...</Text>
          ) : candidates.length === 0 ? (
            <Text style={styles.helperText}>No likely plan match found. This run remains unplanned.</Text>
          ) : (
            <View style={styles.candidateList}>
              {candidates.map((candidate) => (
                <View key={String(candidate.plannedWorkoutId)} style={styles.candidateCard}>
                  <Text style={styles.candidateTitle}>
                    {formatDateKeyForDisplay(candidate.scheduledDateKey)} · {formatWorkoutTypeLabel(candidate.type)}
                  </Text>
                  <Text style={styles.helperText}>
                    Confidence {Math.round(candidate.confidence * 100)}% · Week {candidate.weekNumber}
                  </Text>
                  <PrimaryButton
                    label={
                      linkingWorkoutId === String(candidate.plannedWorkoutId)
                        ? "Linking..."
                        : "Link to Planned Workout"
                    }
                    onPress={() => void onLinkWorkout(candidate.plannedWorkoutId)}
                    disabled={linkingWorkoutId !== null}
                  />
                </View>
              ))}
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}
