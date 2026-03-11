import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  formatDateKeyForDisplay as formatDateKey,
  formatDistanceForDisplay as formatDistance,
  formatDurationClock as formatDuration,
  formatEffortModifierLabel,
  formatElevationForDisplay as formatElevation,
  formatPaceSecondsPerMeterForDisplay as formatPace,
  type EffortModifier,
  type UnitPreference,
} from "@slopmiles/domain";

import { api, type Id } from "../convex";
import {
  Button,
  Field,
  StatusMessage,
  effortModifierOptions,
  formatWorkoutType,
} from "./shared";

function formatHeartRate(heartRate?: number) {
  return typeof heartRate === "number" ? `${Math.round(heartRate)} bpm` : null;
}

function formatMatchStatus(status: "matched" | "unmatched" | "needsReview") {
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

function matchStatusClass(status: "matched" | "unmatched" | "needsReview") {
  switch (status) {
    case "matched":
      return "execution-status-matched";
    case "needsReview":
      return "execution-status-needs-review";
    case "unmatched":
      return "execution-status-unmatched";
    default:
      return "execution-status-unmatched";
  }
}

function formatPlannedTarget(
  rep: {
    plannedSeconds: number | null;
    plannedMeters: number | null;
    plannedPaceSecondsPerMeter: number | null;
  },
  unitPreference: UnitPreference,
) {
  if (rep.plannedSeconds === null && rep.plannedMeters === null) {
    return "Extra / unmatched rep";
  }

  const volume =
    typeof rep.plannedSeconds === "number"
      ? formatDuration(rep.plannedSeconds)
      : formatDistance(rep.plannedMeters ?? undefined, unitPreference);
  const pace = formatPace(rep.plannedPaceSecondsPerMeter ?? undefined, unitPreference);
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
) {
  const volume = [
    typeof rep.actualSeconds === "number" ? formatDuration(rep.actualSeconds) : null,
    typeof rep.actualMeters === "number" ? formatDistance(rep.actualMeters, unitPreference) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const pace = formatPace(rep.actualPaceSecondsPerMeter ?? undefined, unitPreference);
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

    return `${formatDateKey(detail.plannedWorkout.scheduledDateKey)} · ${formatWorkoutType(detail.plannedWorkout.type)}`;
  }, [detail?.plannedWorkout]);

  const toggleModifier = (modifier: EffortModifier) => {
    setModifiers((current) =>
      current.includes(modifier)
        ? current.filter((entry) => entry !== modifier)
        : [...current, modifier],
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
    return <p>Loading workout execution…</p>;
  }

  const { execution, importedWorkout } = detail;
  const rawPace = formatPace(importedWorkout.rawPaceSecondsPerMeter ?? undefined, unitPreference);
  const gapPace = importedWorkout.gradeAdjustedPaceSecondsPerMeter
    ? formatPace(importedWorkout.gradeAdjustedPaceSecondsPerMeter, unitPreference)
    : null;
  const averageHeartRate = formatHeartRate(importedWorkout.averageHeartRate);
  const elevationSummary =
    typeof importedWorkout.elevationAscentMeters === "number" ||
    typeof importedWorkout.elevationDescentMeters === "number"
      ? `+${formatElevation(importedWorkout.elevationAscentMeters ?? 0, unitPreference)} / -${formatElevation(
          importedWorkout.elevationDescentMeters ?? 0,
          unitPreference,
        )}`
      : null;

  return (
    <div className="execution-block">
      <div className="execution-header">
        <strong>Actual Run</strong>
        <span className={`pill execution-status ${matchStatusClass(execution.matchStatus)}`}>
          {formatMatchStatus(execution.matchStatus)}
        </span>
      </div>

      <div className="execution-metrics">
        <div className="execution-metric-card">
          <span className="eyebrow">Distance</span>
          <strong>{formatDistance(importedWorkout.distanceMeters, unitPreference)}</strong>
        </div>
        <div className="execution-metric-card">
          <span className="eyebrow">Duration</span>
          <strong>{formatDuration(importedWorkout.durationSeconds)}</strong>
        </div>
        <div className="execution-metric-card">
          <span className="eyebrow">Pace</span>
          <strong>{rawPace}</strong>
        </div>
        {gapPace ? (
          <div className="execution-metric-card">
            <span className="eyebrow">GAP</span>
            <strong>{gapPace}</strong>
          </div>
        ) : null}
        {averageHeartRate ? (
          <div className="execution-metric-card">
            <span className="eyebrow">Avg HR</span>
            <strong>{averageHeartRate}</strong>
          </div>
        ) : null}
        {elevationSummary ? (
          <div className="execution-metric-card">
            <span className="eyebrow">Elevation</span>
            <strong>{elevationSummary}</strong>
          </div>
        ) : null}
      </div>

      {linkedWorkoutSummary ? (
        <div className="inset">
          <strong>Linked workout</strong>
          <p>{linkedWorkoutSummary}</p>
        </div>
      ) : null}

      {detail.segmentComparisons.length > 0 ? (
        <section className="execution-section">
          <h3>Planned vs Actual Reps</h3>
          <div className="stack">
            {detail.segmentComparisons.map((segment) => (
              <div key={`${executionId}:segment:${segment.plannedSegmentOrder}`} className="inset">
                <strong>
                  {segment.plannedLabel}
                  {segment.plannedPaceZone ? ` (${segment.plannedPaceZone})` : ""}
                </strong>
                <p>
                  Adherence {Math.round(segment.adherenceScore * 100)}%
                  {segment.inferred ? " · includes inferred rep boundaries" : ""}
                </p>
                <div className="execution-rep-list">
                  {segment.reps.map((rep) => (
                    <div
                      key={`${executionId}:segment:${segment.plannedSegmentOrder}:rep:${rep.repIndex}`}
                      className="execution-rep-row"
                    >
                      <strong className="execution-rep-label">Rep {rep.repIndex}</strong>
                      <div className="execution-rep-copy">
                        <div>Planned: {formatPlannedTarget(rep, unitPreference)}</div>
                        <div>Actual: {formatActualRep(rep, unitPreference)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="execution-section">
        <h3>Check-In</h3>
        <Field label="RPE (optional)">
          <div className="pill-row wrap" aria-label="RPE (optional)" role="group">
            {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
              <button
                key={value}
                aria-pressed={rpe === value}
                className={`pill-button${rpe === value ? " pill-button-active" : ""}`}
                onClick={() => setRpe(value)}
                type="button"
              >
                {value}
              </button>
            ))}
          </div>
        </Field>
        {rpe !== null ? (
          <Button kind="secondary" onClick={() => setRpe(null)}>
            Clear RPE
          </Button>
        ) : null}
        <Field label="Effort modifiers">
          <div className="pill-row wrap">
            {effortModifierOptions.map((modifier) => (
              <button
                key={modifier}
                className={`pill-button${modifiers.includes(modifier) ? " pill-button-active" : ""}`}
                onClick={() => toggleModifier(modifier)}
                type="button"
              >
                {formatEffortModifierLabel(modifier)}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Custom context">
          <input
            onChange={(event) => setCustomModifierText(event.target.value)}
            placeholder="Anything else the coach should know?"
            value={customModifierText}
          />
        </Field>
        <Field label="Notes">
          <textarea
            onChange={(event) => setNotes(event.target.value)}
            placeholder="How did the run feel?"
            rows={3}
            value={notes}
          />
        </Field>
        {error ? <StatusMessage message={error} tone="error" /> : null}
        {message ? <StatusMessage message={message} tone="success" /> : null}
        <Button disabled={saving} onClick={() => void onSubmitCheckIn()}>
          {saving
            ? "Saving check-in…"
            : execution.checkInStatus === "submitted"
              ? "Update Check-In"
              : "Save Check-In"}
        </Button>
      </section>

      <section className="execution-section">
        <h3>Coach Feedback</h3>
        {execution.feedback.commentary ? (
          <p>{execution.feedback.commentary}</p>
        ) : (
          <p>Coach feedback pending.</p>
        )}
        {execution.feedback.adjustments.length ? (
          <div className="stack">
            {execution.feedback.adjustments.map((adjustment, index) => (
              <p key={`${executionId}:adjustment:${index}`}>{adjustment}</p>
            ))}
          </div>
        ) : null}
      </section>

      {allowMatchControls ? (
        <section className="execution-section">
          <h3>Plan Match</h3>
          {execution.matchStatus === "matched" && detail.plannedWorkout ? (
            <div className="stack">
              <p>{linkedWorkoutSummary}</p>
              <Button disabled={unlinking} kind="secondary" onClick={() => void onUnlinkWorkout()}>
                {unlinking ? "Unlinking…" : "Unlink from Plan"}
              </Button>
            </div>
          ) : candidates === undefined ? (
            <p>Loading candidate workouts…</p>
          ) : candidates.length === 0 ? (
            <p>No likely plan match found. This run remains unplanned.</p>
          ) : (
            <div className="candidate-list">
              {candidates.map((candidate) => (
                <div key={String(candidate.plannedWorkoutId)} className="candidate-card">
                  <strong>
                    {formatDateKey(candidate.scheduledDateKey)} · {formatWorkoutType(candidate.type)}
                  </strong>
                  <p>
                    Confidence {Math.round(candidate.confidence * 100)}% · Week {candidate.weekNumber}
                  </p>
                  <Button
                    disabled={linkingWorkoutId !== null}
                    onClick={() => void onLinkWorkout(candidate.plannedWorkoutId)}
                  >
                    {linkingWorkoutId === String(candidate.plannedWorkoutId)
                      ? "Linking…"
                      : "Link to Planned Workout"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

export function WorkoutLapList({
  intervals,
  unitPreference,
}: {
  intervals: Array<{
    startedAt: number;
    endedAt: number;
    durationSeconds: number;
    distanceMeters?: number;
    rawPaceSecondsPerMeter?: number;
  }>;
  unitPreference: UnitPreference;
}) {
  return (
    <div className="lap-list">
      {intervals.map((interval, index) => (
        <div
          key={`${interval.startedAt}-${interval.endedAt}-${index}`}
          className="lap-row"
        >
          <strong className="lap-label">Lap {index + 1}</strong>
          <div className="lap-copy">
            <div>
              {formatDistance(interval.distanceMeters, unitPreference)} ·{" "}
              {formatDuration(interval.durationSeconds)}
            </div>
            <div>Pace {formatPace(interval.rawPaceSecondsPerMeter ?? undefined, unitPreference)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
