import { useEffect, useMemo, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import {
  EFFORT_MODIFIERS,
  type EffortModifier,
  type UnitPreference,
} from "@slopmiles/domain";

import { api, type Id } from "../convex";
import { ChoiceRow, PrimaryButton, SecondaryButton, TagGrid } from "./common";
import { styles } from "../styles";
import { formatDistanceForDisplay, prefersImperialDistance } from "../units";

const RPE_OPTIONS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"] as const;

function formatDuration(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = rounded % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatPace(
  durationSeconds: number,
  distanceMeters: number | undefined,
  unitPreference: UnitPreference,
): string {
  if (typeof distanceMeters !== "number" || distanceMeters <= 0 || durationSeconds <= 0) {
    return "-";
  }

  const useImperial = prefersImperialDistance(unitPreference);
  const distance = useImperial ? distanceMeters / 1609.344 : distanceMeters / 1000;
  if (distance <= 0) {
    return "-";
  }

  const paceSeconds = durationSeconds / distance;
  const minutes = Math.floor(paceSeconds / 60);
  const seconds = Math.round(paceSeconds % 60);

  return `${minutes}:${String(seconds).padStart(2, "0")} / ${useImperial ? "mi" : "km"}`;
}

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

function formatWorkoutType(type: string): string {
  switch (type) {
    case "easyRun":
      return "Easy Run";
    case "longRun":
      return "Long Run";
    case "tempo":
      return "Tempo";
    case "intervals":
      return "Intervals";
    case "recovery":
      return "Recovery";
    default:
      return type;
  }
}

function formatModifierLabel(modifier: EffortModifier): string {
  switch (modifier) {
    case "pushedStroller":
      return "Pushed Stroller";
    case "ranWithDog":
      return "Ran with Dog";
    case "trailOffRoad":
      return "Trail / Off-Road";
    case "treadmill":
      return "Treadmill";
    case "highAltitude":
      return "High Altitude";
    case "poorSleep":
      return "Poor Sleep";
    case "feelingUnwell":
      return "Feeling Unwell";
    default:
      return modifier;
  }
}

function formatDateKey(dateKey: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dateKey}T00:00:00Z`));
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

export function WorkoutExecutionDetail({
  executionId,
  unitPreference,
  allowMatchControls = false,
}: {
  executionId: Id<"workoutExecutions">;
  unitPreference: UnitPreference;
  allowMatchControls?: boolean;
}) {
  const detail = useQuery(api.workouts.getExecutionDetail, {
    executionId,
  });
  const candidateHealthKitWorkoutId = detail?.importedWorkout._id;
  const candidates = useQuery(
    api.workouts.getMatchCandidates,
    allowMatchControls && candidateHealthKitWorkoutId
      ? {
          healthKitWorkoutId: candidateHealthKitWorkoutId,
        }
      : "skip",
  );
  const submitCheckIn = useMutation(api.workouts.submitCheckIn);
  const linkImportedWorkout = useMutation(api.workouts.linkImportedWorkout);
  const unlinkImportedWorkout = useMutation(api.workouts.unlinkImportedWorkout);

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

    return `${formatDateKey(detail.plannedWorkout.scheduledDateKey)} · ${formatWorkoutType(detail.plannedWorkout.type)}`;
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
          <Text style={styles.metricValue}>{formatDuration(importedWorkout.durationSeconds)}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Pace</Text>
          <Text style={styles.metricValue}>
            {formatPace(importedWorkout.durationSeconds, importedWorkout.distanceMeters, unitPreference)}
          </Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Avg HR</Text>
          <Text style={styles.metricValue}>{formatHeartRate(importedWorkout.averageHeartRate)}</Text>
        </View>
      </View>

      {linkedWorkoutSummary ? (
        <View style={styles.subtleBlock}>
          <Text style={styles.label}>Linked workout</Text>
          <Text style={styles.bodyText}>{linkedWorkoutSummary}</Text>
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
          options={EFFORT_MODIFIERS.map((modifier) => formatModifierLabel(modifier))}
          selected={modifiers.map((modifier) => formatModifierLabel(modifier))}
          onToggle={(label) => {
            const modifier = EFFORT_MODIFIERS.find((entry) => formatModifierLabel(entry) === label);
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
                    {formatDateKey(candidate.scheduledDateKey)} · {formatWorkoutType(candidate.type)}
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
