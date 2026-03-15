import { useEffect, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import {
  SETTINGS_COMPONENT_CAPABILITIES,
  type CoachInboxView,
  type DashboardPendingAction,
} from "@slopmiles/component-contracts";
import {
  formatDateKeyForDisplay as formatDateKey,
  formatDateTimeForDisplay as formatDateTime,
  formatDistanceForDisplay as formatDistance,
  formatDurationClock as formatDuration,
  formatPaceSecondsPerMeterForDisplay as formatPace,
  formatResolvedPaceTargetForDisplay,
  formatVolumeForDisplay as formatVolume,
  projectedRaceTime,
  type CompetitivenessLevel,
  type PersonalityPreset,
  type UnitPreference,
  type VolumeMode,
  type Weekday,
} from "@slopmiles/domain";
import { Link, useNavigate, useParams } from "react-router-dom";

import { api, type Id } from "../convex";
import { PlanAssessmentSummary } from "./assessment";
import { type SessionData } from "./session";
import {
  ActionLink,
  Button,
  Card,
  DayPicker,
  Field,
  Screen,
  StatusMessage,
  clampRunningDaysPerWeek,
  coachPromptPresets,
  cx,
  distanceUnitOptions,
  effortModifierOptions,
  formatDurationInput,
  formatFriendlyLabel,
  formatWeekdayLabel,
  formatWeekdayShort,
  formatWorkoutType,
  interruptionOptions,
  nonRaceGoalPresets,
  parseDurationInput,
  raceGoalPresets,
  strengthEquipmentOptions,
  surfaceOptions,
  toMeters,
  toggleArrayValue,
  type DistanceUnitOption,
  type EffortModifierOption,
  type InterruptionOption,
  type StrengthEquipmentOption,
  type SurfaceOption,
  weekdayOptions,
} from "./shared";
import { WorkoutExecutionDetail, WorkoutLapList } from "./workoutExecution";

function formatRaceTime(seconds: number | null | undefined) {
  return typeof seconds === "number" ? formatDuration(seconds) : "-";
}

function formatWorkoutSegmentLine(
  segment: {
    label: string;
    paceZone: string;
    targetValue: number;
    targetUnit: "seconds" | "meters";
    repetitions?: number;
    restValue?: number;
    restUnit?: "seconds" | "meters";
  },
  unitPreference: UnitPreference,
  vdotAtGeneration?: number,
) {
  const target =
    segment.targetUnit === "seconds"
      ? formatDuration(segment.targetValue)
      : `${Math.round(segment.targetValue)}m`;
  const reps = segment.repetitions ? `${segment.repetitions} x ` : "";
  const rest =
    typeof segment.restValue === "number" && segment.restUnit
      ? ` / ${
          segment.restUnit === "seconds"
            ? formatDuration(segment.restValue)
            : `${Math.round(segment.restValue)}m`
        } easy`
      : "";
  const explicitPace = formatResolvedPaceTargetForDisplay(
    vdotAtGeneration ?? null,
    segment.paceZone,
    unitPreference,
  );
  const paceLabel = explicitPace ? `${segment.paceZone} (${explicitPace})` : segment.paceZone;

  return `${segment.label}: ${reps}${target} @ ${paceLabel}${rest}`;
}

function PlanWeekStructure({
  numberOfWeeks,
  weeklyVolumeProfile,
  weeklyEmphasis,
}: {
  numberOfWeeks: number;
  weeklyVolumeProfile?: Array<{ weekNumber: number; percentOfPeak: number }>;
  weeklyEmphasis?: Array<{ weekNumber: number; emphasis: string }>;
}) {
  const percentByWeek = new Map(
    (weeklyVolumeProfile ?? []).map((entry) => [entry.weekNumber, entry.percentOfPeak]),
  );
  const emphasisByWeek = new Map(
    (weeklyEmphasis ?? []).map((entry) => [entry.weekNumber, entry.emphasis]),
  );

  return (
    <div className="stack">
      {Array.from({ length: numberOfWeeks }, (_, index) => index + 1).map((weekNumber) => (
        <div className="row-card" key={weekNumber}>
          <div>
            <strong>Week {weekNumber}</strong>
            <div>{emphasisByWeek.get(weekNumber) ?? "No emphasis"}</div>
          </div>
          <span className="pill">
            {percentByWeek.has(weekNumber)
              ? `${Math.round((percentByWeek.get(weekNumber) ?? 0) * 100)}%`
              : "--"}
          </span>
        </div>
      ))}
    </div>
  );
}

const WEB_TIME_BUCKET_MS = 15 * 60 * 1000;
const WEB_HISTORY_PAGE_SIZE = 10;

function getWebTimeBucketMs() {
  return Math.floor(Date.now() / WEB_TIME_BUCKET_MS) * WEB_TIME_BUCKET_MS;
}

export function OnboardingPage({
  session,
  onRefresh,
}: {
  session: SessionData;
  onRefresh: () => Promise<void>;
}) {
  const completeStep = useMutation(api.onboarding.completeStep);
  const saveHealthKitAuthorization = useMutation(
    api.onboarding.saveHealthKitAuthorization,
  );
  const saveProfileBasics = useMutation(api.onboarding.saveProfileBasics);
  const saveRunningSchedule = useMutation(api.onboarding.saveRunningSchedule);
  const saveTrackAccess = useMutation(api.onboarding.saveTrackAccess);
  const saveVdotFromHistoryWorkout = useMutation(
    api.onboarding.saveVdotFromHistoryWorkout,
  );
  const saveVdotFromManualResult = useMutation(api.onboarding.saveVdotFromManualResult);
  const saveCompetitiveness = useMutation(api.onboarding.saveCompetitiveness);
  const savePersonality = useMutation(api.onboarding.savePersonality);
  const historyWorkouts = useQuery(
    api.healthkit.listImportedWorkouts,
    session.onboardingState.currentStep === "establishVDOT" ? { limit: 200 } : "skip",
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unitPreference, setUnitPreference] = useState<UnitPreference>(
    session.user.unitPreference,
  );
  const [volumeMode, setVolumeMode] = useState<VolumeMode>(
    session.user.volumePreference,
  );
  const [runningDays, setRunningDays] = useState<Weekday[]>(
    session.runningSchedule.preferredRunningDays,
  );
  const [runningDaysPerWeek, setRunningDaysPerWeek] = useState(
    session.runningSchedule.runningDaysPerWeek,
  );
  const [longRunDay, setLongRunDay] = useState<Weekday | "">(
    (session.runningSchedule.preferredLongRunDay ?? "") as Weekday | "",
  );
  const [qualityDays, setQualityDays] = useState<Weekday[]>(
    session.runningSchedule.preferredQualityDays,
  );
  const [trackAccess, setTrackAccess] = useState(session.user.trackAccess);
  const [manualDistance, setManualDistance] = useState("5000");
  const [manualTime, setManualTime] = useState("25:00");
  const [competitiveness, setCompetitiveness] = useState<CompetitivenessLevel>(
    session.competitiveness.level,
  );
  const [personality, setPersonality] = useState<PersonalityPreset>(
    session.personality.name as PersonalityPreset,
  );
  const [customPersonality, setCustomPersonality] = useState(
    session.personality.name === "custom" ? session.personality.description : "",
  );
  const navigate = useNavigate();

  const run = async (task: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await task();
      await onRefresh();
    } catch (taskError) {
      setError(String(taskError));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (session.onboardingState.isComplete) {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate, session.onboardingState.isComplete]);

  const currentStepNumber = Math.max(
    1,
    [
      "welcome",
      "healthKitAuthorization",
      "profileBasics",
      "runningSchedule",
      "trackAccess",
      "establishVDOT",
      "competitiveness",
      "personality",
      "notifications",
      "done",
    ].indexOf(session.onboardingState.currentStep) + 1,
  );
  const manualTimeSeconds = parseDurationInput(manualTime);

  return (
    <main className="onboarding-shell">
      <Screen title="Onboarding" subtitle={`Step ${currentStepNumber} of 10`}>
        <Card title="Setup progress" eyebrow="Status">
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${Math.min(100, (currentStepNumber / 10) * 100)}%` }}
            />
          </div>
          <p>
            Finish the minimum setup once, then the web app stays focused on plan,
            history, coach, and settings work.
          </p>
        </Card>

        {error ? <StatusMessage message={error} tone="error" /> : null}

        {session.onboardingState.currentStep === "welcome" ? (
          <Card title="Welcome" eyebrow="Step 1">
            <p>
              Your browser companion keeps the main training tasks close together:
              next workout, plan adjustments, history cleanup, and coach chat.
            </p>
            <Button
              disabled={busy}
              onClick={() => void run(async () => completeStep({ step: "welcome" }))}
            >
              Start setup
            </Button>
          </Card>
        ) : null}

        {session.onboardingState.currentStep === "healthKitAuthorization" ? (
          <Card title="Workout import stays on iPhone" eyebrow="Step 2">
            <p>
              The web app does not request HealthKit directly. You can keep going
              here and sync workout data from iPhone later.
            </p>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () =>
                  saveHealthKitAuthorization({
                    authorized: false,
                  }),
                )
              }
            >
              Continue
            </Button>
          </Card>
        ) : null}

        {session.onboardingState.currentStep === "profileBasics" ? (
          <Card title="Profile basics" eyebrow="Step 3">
            <div className="form-grid">
              <Field label="Units">
                <select
                  onChange={(event) =>
                    setUnitPreference(event.target.value as UnitPreference)
                  }
                  value={unitPreference}
                >
                  <option value="system">System</option>
                  <option value="metric">Metric</option>
                  <option value="imperial">Imperial</option>
                </select>
              </Field>
              <Field
                label="Plan volume mode"
                hint="You can change this later in Settings."
              >
                <select
                  onChange={(event) =>
                    setVolumeMode(event.target.value as VolumeMode)
                  }
                  value={volumeMode}
                >
                  <option value="time">Time</option>
                  <option value="distance">Distance</option>
                </select>
              </Field>
            </div>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () =>
                  saveProfileBasics({
                    unitPreference,
                    volumePreference: volumeMode,
                  }),
                )
              }
            >
              Save and continue
            </Button>
          </Card>
        ) : null}

        {session.onboardingState.currentStep === "runningSchedule" ? (
          <Card title="Running schedule" eyebrow="Step 4">
            <Field label="Days you can run">
              <DayPicker
                days={runningDays}
                onToggle={(day) =>
                  setRunningDays((current) => toggleArrayValue(day, current))
                }
              />
            </Field>
            <div className="form-grid">
              <Field label="Run days per week">
                <input
                  max={runningDays.length || 1}
                  min={1}
                  onChange={(event) => setRunningDaysPerWeek(Number(event.target.value))}
                  type="number"
                  value={runningDaysPerWeek}
                />
              </Field>
              <Field label="Preferred long run day">
                <select
                  onChange={(event) => setLongRunDay(event.target.value as Weekday | "")}
                  value={longRunDay}
                >
                  <option value="">Coach decides</option>
                  {runningDays.map((day) => (
                    <option key={day} value={day}>
                      {formatWeekdayLabel(day)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Preferred quality days">
              <div className="pill-row wrap">
                {runningDays.map((day) => (
                  <button
                    key={day}
                    className={cx(
                      "pill-button",
                      qualityDays.includes(day) && "pill-button-active",
                    )}
                    onClick={() =>
                      setQualityDays((current) => toggleArrayValue(day, current))
                    }
                    type="button"
                  >
                    {formatWeekdayShort(day)}
                  </button>
                ))}
              </div>
            </Field>
            <Button
              disabled={busy || runningDays.length === 0}
              onClick={() =>
                void run(async () =>
                  saveRunningSchedule({
                    preferredRunningDays: runningDays,
                    runningDaysPerWeek: clampRunningDaysPerWeek(
                      runningDaysPerWeek,
                      runningDays,
                    ),
                    preferredLongRunDay: longRunDay || undefined,
                    preferredQualityDays: qualityDays.filter((day) =>
                      runningDays.includes(day),
                    ),
                  }),
                )
              }
            >
              Save and continue
            </Button>
          </Card>
        ) : null}

        {session.onboardingState.currentStep === "trackAccess" ? (
          <Card title="Track access" eyebrow="Step 5">
            <label className="toggle">
              <input
                checked={trackAccess}
                onChange={(event) => setTrackAccess(event.target.checked)}
                type="checkbox"
              />
              <span>I regularly have access to a running track.</span>
            </label>
            <Button
              disabled={busy}
              onClick={() => void run(async () => saveTrackAccess({ trackAccess }))}
            >
              Save and continue
            </Button>
          </Card>
        ) : null}

        {session.onboardingState.currentStep === "establishVDOT" ? (
          <Card title="Establish VDOT" eyebrow="Step 6">
            <p>
              Use a synced run if one looks representative, or enter a recent race
              result manually.
            </p>
            <div className="stack">
              {historyWorkouts?.slice(0, 5).map((workout) => (
                <div className="row-card" key={String(workout._id)}>
                  <div>
                    <strong>{formatDateTime(workout.startedAt)}</strong>
                    <div>
                      {formatDistance(workout.distanceMeters, session.user.unitPreference)}
                      {" · "}
                      {formatDuration(workout.durationSeconds)}
                    </div>
                  </div>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void run(async () =>
                        saveVdotFromHistoryWorkout({
                          healthKitWorkoutId: workout._id,
                        }),
                      )
                    }
                  >
                    Use this run
                  </Button>
                </div>
              ))}
            </div>
            <div className="form-grid">
              <Field label="Race distance (meters)">
                <input
                  onChange={(event) => setManualDistance(event.target.value)}
                  value={manualDistance}
                />
              </Field>
              <Field label="Race time" hint="Use MM:SS or HH:MM:SS.">
                <input
                  onChange={(event) => setManualTime(event.target.value)}
                  value={manualTime}
                />
              </Field>
            </div>
            <div className="button-row wrap">
              <Button
                disabled={busy || !manualTimeSeconds}
                onClick={() =>
                  void run(async () =>
                    saveVdotFromManualResult({
                      distanceMeters: Number(manualDistance),
                      timeSeconds: manualTimeSeconds ?? 0,
                    }),
                  )
                }
              >
                Save result
              </Button>
              <Button
                disabled={busy}
                kind="secondary"
                onClick={() =>
                  void run(async () => completeStep({ step: "establishVDOT" }))
                }
              >
                Skip for now
              </Button>
            </div>
          </Card>
        ) : null}

        {session.onboardingState.currentStep === "competitiveness" ? (
          <Card title="Competitiveness" eyebrow="Step 7">
            <div className="pill-row wrap">
              {(["conservative", "balanced", "aggressive"] as CompetitivenessLevel[]).map(
                (level) => (
                  <button
                    key={level}
                    className={cx(
                      "pill-button",
                      competitiveness === level && "pill-button-active",
                    )}
                    onClick={() => setCompetitiveness(level)}
                    type="button"
                  >
                    {formatFriendlyLabel(level)}
                  </button>
                ),
              )}
            </div>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => saveCompetitiveness({ level: competitiveness }))
              }
            >
              Save and continue
            </Button>
          </Card>
        ) : null}

        {session.onboardingState.currentStep === "personality" ? (
          <Card title="Coach personality" eyebrow="Step 8">
            <div className="pill-row wrap">
              {(
                ["cheerleader", "noNonsense", "nerd", "zen", "custom"] as PersonalityPreset[]
              ).map((preset) => (
                <button
                  key={preset}
                  className={cx(
                    "pill-button",
                    personality === preset && "pill-button-active",
                  )}
                  onClick={() => setPersonality(preset)}
                  type="button"
                >
                  {formatFriendlyLabel(preset)}
                </button>
              ))}
            </div>
            {personality === "custom" ? (
              <Field label="Describe your ideal coach">
                <textarea
                  onChange={(event) => setCustomPersonality(event.target.value)}
                  rows={4}
                  value={customPersonality}
                />
              </Field>
            ) : null}
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () =>
                  savePersonality({
                    preset: personality,
                    customDescription:
                      personality === "custom" ? customPersonality : undefined,
                  }),
                )
              }
            >
              Save and continue
            </Button>
          </Card>
        ) : null}

        {session.onboardingState.currentStep === "notifications" ? (
          <Card title="Notifications" eyebrow="Step 9">
            <p>
              Push notifications remain an iPhone feature. On web, the focus is
              staying productive once you open the app.
            </p>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => completeStep({ step: "notifications" }))
              }
            >
              Finish setup
            </Button>
          </Card>
        ) : null}

        {session.onboardingState.currentStep === "done" ? (
          <Card title="Ready to train" eyebrow="Final step">
            <p>
              Setup is complete. The dashboard will point you to the next useful
              action.
            </p>
            <Button
              disabled={busy}
              onClick={() => void run(async () => completeStep({ step: "done" }))}
            >
              Go to dashboard
            </Button>
          </Card>
        ) : null}
      </Screen>
    </main>
  );
}

export function DashboardPage({ session }: { session: SessionData }) {
  const [nowBucketMs, setNowBucketMs] = useState(getWebTimeBucketMs);
  const dashboard = useQuery(api.dashboard.getDashboardView, { nowBucketMs });
  const retryPlanAssessment = useMutation(api.coach.retryPlanAssessment);
  const [retryingAssessmentId, setRetryingAssessmentId] = useState<string | null>(null);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setNowBucketMs(getWebTimeBucketMs());
    }, 60 * 1000);

    return () => clearInterval(intervalId);
  }, []);

  const progressPercent = dashboard?.weekProgress
    ? Math.round(
        (dashboard.weekProgress.completedWorkouts /
          Math.max(1, dashboard.weekProgress.totalWorkouts)) *
          100,
      )
    : 0;

  return (
    <Screen
      title="Dashboard"
      subtitle="The next useful step should be obvious as soon as you land here."
    >
      {!dashboard ? <StatusMessage message="Loading dashboard…" /> : null}

      {dashboard ? (
        <>
          <div className="dashboard-grid">
            <Card title="What to do now" eyebrow="Action center">
              {dashboard.activePlan ? (
                <div className="stack">
                  <div className="inset">
                    <strong>{dashboard.activePlan.label}</strong>
                    <p>
                      Week {dashboard.activePlan.currentWeekNumber ?? "—"} of{" "}
                      {dashboard.activePlan.numberOfWeeks}
                    </p>
                  </div>
                  <div className="button-row wrap">
                    {dashboard.nextWorkout ? (
                      <ActionLink to={`/plan/workout/${String(dashboard.nextWorkout._id)}`}>
                        Open next workout
                      </ActionLink>
                    ) : (
                      <ActionLink to="/plan">Open plan</ActionLink>
                    )}
                    {dashboard.activePlan.currentWeekNumber ? (
                      <ActionLink
                        kind="secondary"
                        to={`/plan/week/${dashboard.activePlan.currentWeekNumber}`}
                      >
                        Review this week
                      </ActionLink>
                    ) : null}
                    <ActionLink kind="secondary" to="/coach">
                      Ask coach
                    </ActionLink>
                  </div>
                </div>
              ) : (
                <div className="stack">
                  <p>
                    No active plan. Start there, then the dashboard will become
                    your quick daily check-in point.
                  </p>
                  <div className="button-row wrap">
                    <ActionLink to="/plan">Create plan</ActionLink>
                    <ActionLink kind="secondary" to="/coach">
                      Talk through goals
                    </ActionLink>
                  </div>
                </div>
              )}
            </Card>

            <Card title="Next workout" eyebrow="Next up">
              {dashboard.nextWorkout ? (
                <div className="stack">
                  <div>
                    <strong>{formatWorkoutType(dashboard.nextWorkout.type)}</strong>
                    <p>
                      {formatDateKey(dashboard.nextWorkout.scheduledDateKey)}
                      {" · "}
                      {formatVolume(
                        dashboard.activePlan?.volumeMode ?? session.user.volumePreference,
                        dashboard.nextWorkout.absoluteVolume,
                        session.user.unitPreference,
                      )}
                    </p>
                  </div>
                  {dashboard.nextWorkout.venue ? (
                    <div className="inset">
                      <strong>Venue</strong>
                      <p>{dashboard.nextWorkout.venue}</p>
                    </div>
                  ) : null}
                  <ActionLink
                    kind="secondary"
                    to={`/plan/workout/${String(dashboard.nextWorkout._id)}`}
                  >
                    Open detail
                  </ActionLink>
                </div>
              ) : (
                <p>No workout is scheduled yet for the current week.</p>
              )}
            </Card>
          </div>

          <div className="dashboard-grid">
            <Card title="Week progress" eyebrow="Execution">
              {dashboard.weekProgress ? (
                <div className="stack">
                  <div className="mini-metrics">
                    <div className="mini-stat">
                      <strong>{dashboard.weekProgress.completedWorkouts}</strong>
                      <span>completed</span>
                    </div>
                    <div className="mini-stat">
                      <strong>{dashboard.weekProgress.totalWorkouts}</strong>
                      <span>planned</span>
                    </div>
                    <div className="mini-stat">
                      <strong>
                        {Math.round(dashboard.weekProgress.targetVolumePercent * 100)}%
                      </strong>
                      <span>of peak</span>
                    </div>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
                  </div>
                  <p>{dashboard.weekProgress.emphasis}</p>
                </div>
              ) : (
                <p>No current week yet.</p>
              )}
            </Card>

            <Card title="VDOT snapshot" eyebrow="Fitness">
              {typeof dashboard.currentVDOT === "number" ? (
                <div className="stack">
                  <p>Current VDOT {dashboard.currentVDOT.toFixed(1)}</p>
                  <div className="metric-list wrap">
                    <span>5K {formatRaceTime(projectedRaceTime(dashboard.currentVDOT, 5000))}</span>
                    <span>10K {formatRaceTime(projectedRaceTime(dashboard.currentVDOT, 10000))}</span>
                    <span>
                      Half{" "}
                      {formatRaceTime(
                        projectedRaceTime(dashboard.currentVDOT, 21097.5),
                      )}
                    </span>
                    <span>
                      Marathon{" "}
                      {formatRaceTime(
                        projectedRaceTime(dashboard.currentVDOT, 42195),
                      )}
                    </span>
                  </div>
                </div>
              ) : (
                <p>No VDOT set yet. Finish onboarding or use synced history to set one.</p>
              )}
            </Card>
          </div>

          <Card title="Pending actions" eyebrow="Triage">
            {dashboard.pendingActions.length ? (
              <div className="stack">
                {dashboard.pendingActions.map((action: DashboardPendingAction) => (
                  <div className="row-card" key={`${action.kind}-${action.label}`}>
                    <div>
                      <strong>{action.label}</strong>
                      <div>{action.description}</div>
                    </div>
                    {action.kind === "createPlan" ? <ActionLink to="/plan">Open plan</ActionLink> : null}
                    {action.kind === "activateDraft" ? <ActionLink to="/plan">Review draft</ActionLink> : null}
                    {action.kind === "generateWeek" && typeof action.weekNumber === "number" ? (
                      <ActionLink to={`/plan/week/${action.weekNumber}`}>Open week</ActionLink>
                    ) : null}
                    {action.kind === "submitCheckIn" && action.workoutId ? (
                      <ActionLink to={`/plan/workout/${String(action.workoutId)}`}>Open workout</ActionLink>
                    ) : null}
                    {action.kind === "reviewHistory" && action.healthKitWorkoutId ? (
                      <ActionLink to={`/history/${String(action.healthKitWorkoutId)}`}>Review run</ActionLink>
                    ) : null}
                    {action.kind === "messageCoach" ? <ActionLink to="/coach">Open coach</ActionLink> : null}
                  </div>
                ))}
              </div>
            ) : (
              <p>No actions are queued right now.</p>
            )}
          </Card>

          <Card
            title="Latest coach note"
            eyebrow="Coach"
            actions={<ActionLink kind="secondary" to="/coach">Open coach</ActionLink>}
          >
            {dashboard.latestCoachMessage ? (
              <p>{dashboard.latestCoachMessage.body}</p>
            ) : (
              <p>No coach notes yet. Start the conversation from the Coach tab.</p>
            )}
          </Card>

          {dashboard.pastPlan ? (
            <Card
              title={`${dashboard.pastPlan.label} assessment`}
              eyebrow="Previous block"
              actions={<ActionLink kind="secondary" to={`/plan/history/${String(dashboard.pastPlan._id)}`}>Open history</ActionLink>}
            >
              <PlanAssessmentSummary
                state={dashboard.pastPlan.assessment}
                retrying={retryingAssessmentId === dashboard.pastPlan.assessment.request?._id}
                onRetry={(requestId) => {
                  void (async () => {
                    setRetryingAssessmentId(requestId);
                    try {
                      await retryPlanAssessment({ requestId: requestId as Id<"aiRequests"> });
                    } finally {
                      setRetryingAssessmentId(null);
                    }
                  })();
                }}
              />
            </Card>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

export function PlanPage({
  session,
  onRefresh,
}: {
  session: SessionData;
  onRefresh: () => Promise<void>;
}) {
  const [nowBucketMs, setNowBucketMs] = useState(getWebTimeBucketMs);
  const planView = useQuery(api.planOverview.getPlanOverviewView, { nowBucketMs });
  const planBuilderView = useQuery(api.planning.getPlanBuilderView, {});
  const startPlanBuilderSession = useMutation(api.planning.startPlanBuilderSession);
  const sendPlanBuilderMessage = useMutation(api.planning.sendPlanBuilderMessage);
  const materializePlanDraft = useMutation(api.planning.materializePlanDraft);
  const retryPlanAssessment = useMutation(api.coach.retryPlanAssessment);
  const updateDraftPlanBasics = useMutation(api.plans.updateDraftPlanBasics);
  const updatePlanStatus = useMutation(api.plans.updatePlanStatus);
  const updatePlanPeakVolume = useMutation(api.planOverview.updatePlanPeakVolume);
  const changePlanGoal = useMutation(api.planOverview.changePlanGoal);
  const reportPlanInterruption = useMutation(api.planOverview.reportPlanInterruption);
  const upsertRace = useMutation(api.planOverview.upsertRace);
  const deleteRace = useMutation(api.planOverview.deleteRace);

  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [goalType, setGoalType] = useState<"race" | "nonRace">("race");
  const [goalLabel, setGoalLabel] = useState("5K");
  const [targetDate, setTargetDate] = useState("");
  const [goalTime, setGoalTime] = useState("");
  const [requestedWeeks, setRequestedWeeks] = useState("10");
  const [volumeMode, setVolumeMode] = useState<VolumeMode>(
    session.user.volumePreference,
  );
  const [includeStrength, setIncludeStrength] = useState(
    session.user.strengthTrainingEnabled ?? false,
  );
  const [strengthEquipment, setStrengthEquipment] = useState<StrengthEquipmentOption[]>(
    (session.user.strengthEquipment ?? []) as StrengthEquipmentOption[],
  );
  const [proposalPeakWeekVolume, setProposalPeakWeekVolume] = useState("");
  const [planBuilderMessage, setPlanBuilderMessage] = useState("");
  const [peakWeekVolume, setPeakWeekVolume] = useState("");
  const [goalEditType, setGoalEditType] = useState<"race" | "nonRace">("race");
  const [goalEditLabel, setGoalEditLabel] = useState("");
  const [goalEditDate, setGoalEditDate] = useState("");
  const [goalEditTime, setGoalEditTime] = useState("");
  const [interruptionType, setInterruptionType] = useState<InterruptionOption>("life");
  const [interruptionNote, setInterruptionNote] = useState("");
  const [raceLabel, setRaceLabel] = useState("");
  const [raceDate, setRaceDate] = useState("");
  const [raceDistanceValue, setRaceDistanceValue] = useState("10");
  const [raceDistanceUnit, setRaceDistanceUnit] =
    useState<DistanceUnitOption>("kilometers");
  const [raceGoalTime, setRaceGoalTime] = useState("");
  const [showCreateDraft, setShowCreateDraft] = useState(true);
  const [retryingAssessmentId, setRetryingAssessmentId] = useState<string | null>(null);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setNowBucketMs(getWebTimeBucketMs());
    }, 60 * 1000);

    return () => clearInterval(intervalId);
  }, []);

  const run = async (task: () => Promise<unknown>, success?: string) => {
    setStatus(null);
    setError(null);
    try {
      await task();
      if (success) {
        setStatus(success);
      }
      await onRefresh();
    } catch (taskError) {
      setError(String(taskError));
    }
  };

  const currentPlan = planView?.activePlan ?? null;
  const latestPlanDraft = planBuilderView?.draft ?? null;
  const hasExistingPlanWork = Boolean(
    currentPlan || (latestPlanDraft && !latestPlanDraft.consumedByPlanId),
  );
  const proposalGoalTimeSeconds = parseDurationInput(goalTime);
  const goalEditTimeSeconds = parseDurationInput(goalEditTime);
  const raceGoalTimeSeconds = parseDurationInput(raceGoalTime);
  const raceDistanceMeters = toMeters(raceDistanceValue, raceDistanceUnit);
  const canSubmitPlanRequest =
    goalLabel.trim().length > 0 && (goalType !== "race" || Boolean(targetDate));

  useEffect(() => {
    setShowCreateDraft(!hasExistingPlanWork);
  }, [hasExistingPlanWork]);

  useEffect(() => {
    if (latestPlanDraft?.latestObject && "peakWeekVolume" in latestPlanDraft.latestObject) {
      setProposalPeakWeekVolume(String(latestPlanDraft.latestObject.peakWeekVolume));
    }
  }, [latestPlanDraft?.latestObject]);

  useEffect(() => {
    if (!currentPlan) {
      setPeakWeekVolume("");
      setGoalEditLabel("");
      setGoalEditDate("");
      setGoalEditTime("");
      return;
    }

    setPeakWeekVolume(String(currentPlan.peakWeekVolume));
    setGoalEditType(currentPlan.goalType === "race" ? "race" : "nonRace");
    setGoalEditLabel(currentPlan.goalLabel);
    setGoalEditDate(
      currentPlan.targetDate
        ? new Date(currentPlan.targetDate).toISOString().slice(0, 10)
        : "",
    );
    setGoalEditTime(formatDurationInput(currentPlan.goalTimeSeconds));
  }, [
    currentPlan?._id,
    currentPlan?.goalLabel,
    currentPlan?.goalTimeSeconds,
    currentPlan?.goalType,
    currentPlan?.peakWeekVolume,
    currentPlan?.targetDate,
  ]);

  const applyGoalPreset = (label: string, nextGoalType: "race" | "nonRace") => {
    setGoalLabel(label);
    setGoalType(nextGoalType);
  };

  const createDraftCard = (
    <Card
      title={hasExistingPlanWork ? "Start another plan" : "Plan builder"}
      eyebrow={hasExistingPlanWork ? "Optional" : "Start here"}
      actions={
        hasExistingPlanWork ? (
          <Button kind="secondary" onClick={() => setShowCreateDraft((current) => !current)}>
            {showCreateDraft ? "Hide" : "Show"}
          </Button>
        ) : undefined
      }
    >
      <div className="stack">
        {hasExistingPlanWork && !showCreateDraft ? (
          <div className="inset">
            <strong>Keep focus on the current plan</strong>
            <p>
              Open this only if you want to compare against or replace the
              current active plan, draft, or proposal.
            </p>
          </div>
        ) : null}
        {showCreateDraft ? (
          <>
            {hasExistingPlanWork ? (
              <div className="inset">
                <strong>Current planning work already exists</strong>
                <p>
                  Use this only if you want to replace or compare against your current
                  plan, draft, or pending proposal.
                </p>
              </div>
            ) : null}
            <div className="selection-block">
              <strong>Pick a starting point</strong>
              <div className="pill-row wrap">
                {raceGoalPresets.map((preset) => (
                  <button
                    key={preset}
                    className={cx(
                      "pill-button",
                      goalType === "race" && goalLabel === preset && "pill-button-active",
                    )}
                    onClick={() => applyGoalPreset(preset, "race")}
                    type="button"
                  >
                    {preset}
                  </button>
                ))}
                {nonRaceGoalPresets.map((preset) => (
                  <button
                    key={preset}
                    className={cx(
                      "pill-button",
                      goalType === "nonRace" &&
                        goalLabel === preset &&
                        "pill-button-active",
                    )}
                    onClick={() => applyGoalPreset(preset, "nonRace")}
                    type="button"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-grid">
              <Field label="Goal type">
                <select
                  onChange={(event) => setGoalType(event.target.value as "race" | "nonRace")}
                  value={goalType}
                >
                  <option value="race">Race</option>
                  <option value="nonRace">Non-race block</option>
                </select>
              </Field>
              <Field label="Goal name">
                <input
                  onChange={(event) => setGoalLabel(event.target.value)}
                  placeholder="e.g. 15K or Base Building"
                  value={goalLabel}
                />
              </Field>
              <Field
                label={goalType === "race" ? "Race date" : "Target end date"}
                hint={goalType === "race" ? "Required for race goals." : "Optional."}
              >
                <input
                  onChange={(event) => setTargetDate(event.target.value)}
                  type="date"
                  value={targetDate}
                />
              </Field>
              <Field
                label="Goal time"
                hint="Use MM:SS or HH:MM:SS. Leave blank if the coach should choose."
              >
                <input
                  onChange={(event) => setGoalTime(event.target.value)}
                  placeholder="48:00"
                  value={goalTime}
                />
              </Field>
              {goalType === "nonRace" ? (
                <Field label="Weeks">
                  <input
                    min={1}
                    onChange={(event) => setRequestedWeeks(event.target.value)}
                    type="number"
                    value={requestedWeeks}
                  />
                </Field>
              ) : null}
              <Field label="Volume mode">
                <select
                  onChange={(event) => setVolumeMode(event.target.value as VolumeMode)}
                  value={volumeMode}
                >
                  <option value="time">Time</option>
                  <option value="distance">Distance</option>
                </select>
              </Field>
            </div>

            <label className="toggle">
              <input
                checked={includeStrength}
                onChange={(event) => setIncludeStrength(event.target.checked)}
                type="checkbox"
              />
              <span>Include strength work in this draft.</span>
            </label>

            {includeStrength ? (
              <div className="pill-row wrap">
                {strengthEquipmentOptions.map((item) => (
                  <button
                    key={item}
                    className={cx(
                      "pill-button",
                      strengthEquipment.includes(item) && "pill-button-active",
                    )}
                    onClick={() =>
                      setStrengthEquipment((current) => toggleArrayValue(item, current))
                    }
                    type="button"
                  >
                    {formatFriendlyLabel(item)}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="inset">
              <strong>Request summary</strong>
              <p>
                {goalType === "race" ? "Race" : "Non-race"} plan for {goalLabel || "your goal"} in{" "}
                {volumeMode}-based mode
                {includeStrength ? " with strength work." : "."}
              </p>
            </div>

            <Button
              disabled={!canSubmitPlanRequest}
              kind={hasExistingPlanWork ? "secondary" : "primary"}
              onClick={() =>
                void run(
                  async () =>
                    startPlanBuilderSession({
                      goalType,
                      goalLabel,
                      targetDate: targetDate
                        ? new Date(`${targetDate}T00:00:00`).getTime()
                        : undefined,
                      goalTimeSeconds: proposalGoalTimeSeconds,
                      volumeMode,
                      requestedNumberOfWeeks:
                        goalType === "nonRace" ? Number(requestedWeeks) : undefined,
                      includeStrength,
                      strengthEquipment,
                    }),
                  "Planning conversation started.",
                )
              }
            >
              Start planning thread
            </Button>
          </>
        ) : null}
      </div>
    </Card>
  );

  const planningThreadCard = latestPlanDraft ? (
    <Card title="Planning Thread" eyebrow="Live">
      <div className="proposal-block">
        <div className="two-column">
          <div className="stack">
            <div className="row-card">
              <div>
                <strong>Conversation</strong>
                <div>Collaborate with coach and iterate on the plan.</div>
              </div>
              <span className="pill">Version {latestPlanDraft.version}</span>
            </div>
            {planBuilderView?.messages?.length ? (
              <div className="stack">
                {planBuilderView.messages.map((message) => (
                  <div className="row-card" key={message._id}>
                    <div>
                      <strong>{message.author === "assistant" ? "Coach" : "You"}</strong>
                      <div>{message.body}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="inset">
                <strong>Thread warming up</strong>
                <p>The initial seed has been saved. Coach replies will land here.</p>
              </div>
            )}
            <Field label="Ask coach to revise the plan">
              <input
                onChange={(event) => setPlanBuilderMessage(event.target.value)}
                placeholder="Move the peak later, reduce long-run load, add more strength..."
                value={planBuilderMessage}
              />
            </Field>
            <Button
              disabled={!latestPlanDraft || !planBuilderMessage.trim()}
              kind="secondary"
              onClick={() =>
                void run(
                  async () => {
                    await sendPlanBuilderMessage({
                      draftId: latestPlanDraft._id as Id<"agentPlanDrafts">,
                      body: planBuilderMessage,
                    });
                    setPlanBuilderMessage("");
                  },
                  "Coach is revising the draft.",
                )
              }
            >
              Send adjustment
            </Button>
          </div>

          <div className="stack">
            <div className="row-card">
              <div>
                <strong>Live draft</strong>
                <div>Status: {formatFriendlyLabel(latestPlanDraft.validationStatus)}</div>
              </div>
              <span className="pill">
                {latestPlanDraft.validationStatus === "pending"
                  ? "Updating"
                  : latestPlanDraft.validationStatus === "valid"
                    ? "Ready"
                    : "Needs review"}
              </span>
            </div>
            {latestPlanDraft.validationStatus === "pending" ? (
              <div className="inset">
                <strong>Updating structured draft</strong>
                <p>The assistant reply is in. The validated plan preview will appear here as soon as object generation finishes.</p>
              </div>
            ) : null}
            {latestPlanDraft.latestError ? (
              <StatusMessage message={latestPlanDraft.latestError} tone="error" />
            ) : null}
            {latestPlanDraft.latestObject ? (
              <div className="inset">
                {(() => {
                  const draftObject = latestPlanDraft.latestObject as {
                    numberOfWeeks: number;
                    peakWeekVolume: number;
                    rationale: string;
                    weeklyVolumeProfile?: Array<{
                      weekNumber: number;
                      percentOfPeak: number;
                    }>;
                    weeklyEmphasis?: Array<{
                      weekNumber: number;
                      emphasis: string;
                    }>;
                  };

                  return (
                    <>
                      <p>
                        {draftObject.numberOfWeeks} weeks · peak{" "}
                        {formatVolume(
                          volumeMode,
                          draftObject.peakWeekVolume,
                          session.user.unitPreference,
                        )}
                      </p>
                      <p>{draftObject.rationale}</p>
                      <PlanWeekStructure
                        numberOfWeeks={draftObject.numberOfWeeks}
                        weeklyVolumeProfile={draftObject.weeklyVolumeProfile}
                        weeklyEmphasis={draftObject.weeklyEmphasis}
                      />
                    </>
                  );
                })()}
              </div>
            ) : (
              <div className="inset">
                <strong>No validated structure yet</strong>
                <p>The coach can still talk through changes even before the structured draft passes validation.</p>
              </div>
            )}
            {latestPlanDraft.validationStatus === "valid" &&
            !latestPlanDraft.consumedByPlanId ? (
              <div className="stack">
                <Field
                  label="Peak week volume before starting the plan"
                  hint={volumeMode === "time" ? "Minutes" : "Meters"}
                >
                  <input
                    onChange={(event) => setProposalPeakWeekVolume(event.target.value)}
                    type="number"
                    value={proposalPeakWeekVolume}
                  />
                </Field>
                <Button
                  kind={hasExistingPlanWork ? "secondary" : "primary"}
                  onClick={() =>
                    void run(
                      async () =>
                        materializePlanDraft({
                          draftId: latestPlanDraft._id as Id<"agentPlanDrafts">,
                          peakWeekVolumeOverride: Number(proposalPeakWeekVolume),
                          canonicalTimeZoneId:
                            Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
                        }),
                      "Plan activated.",
                    )
                  }
                >
                  Start this plan
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  ) : null;

  const currentPlanCard = (
    <Card
      title={currentPlan ? currentPlan.goalLabel : "No active plan"}
      eyebrow="Current plan"
      actions={
        currentPlan?.currentWeekNumber ? (
          <ActionLink kind="secondary" to={`/plan/week/${currentPlan.currentWeekNumber}`}>
            Open current week
          </ActionLink>
        ) : undefined
      }
    >
      {currentPlan ? (
        <div className="stack">
          <div className="mini-metrics">
            <div className="mini-stat">
              <strong>{formatFriendlyLabel(currentPlan.status)}</strong>
              <span>status</span>
            </div>
            <div className="mini-stat">
              <strong>{currentPlan.numberOfWeeks}</strong>
              <span>weeks</span>
            </div>
            <div className="mini-stat">
              <strong>
                {formatVolume(
                  currentPlan.volumeMode,
                  currentPlan.peakWeekVolume,
                  session.user.unitPreference,
                )}
              </strong>
              <span>peak</span>
            </div>
          </div>

          <div className="metric-list wrap">
            {currentPlan.weeks.map((week) => (
              <Link
                className="week-chip"
                key={String(week._id)}
                to={`/plan/week/${week.weekNumber}`}
              >
                W{week.weekNumber} · {Math.round(week.targetVolumePercent * 100)}% · {week.emphasis}
              </Link>
            ))}
          </div>

          <div className="button-row wrap">
            {currentPlan.status === "active" ? (
              <Button
                kind="secondary"
                onClick={() =>
                  void run(
                    async () =>
                      updatePlanStatus({
                        planId: currentPlan._id,
                        status: "completed",
                      }),
                    "Plan marked complete.",
                  )
                }
              >
                Complete plan
              </Button>
            ) : null}
            {currentPlan.status !== "completed" ? (
              <Button
                kind="secondary"
                onClick={() =>
                  void run(
                    async () =>
                      updatePlanStatus({
                        planId: currentPlan._id,
                        status: "abandoned",
                      }),
                    "Plan closed.",
                  )
                }
              >
                {currentPlan.status === "draft" ? "Discard draft" : "Abandon plan"}
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <p>No plan yet. Request a draft to get started.</p>
      )}
    </Card>
  );

  return (
    <Screen
      title="Plan"
      subtitle="Build a plan, review structure, and handle changes without guesswork."
    >
      {error ? <StatusMessage message={error} tone="error" /> : null}
      {status ? <StatusMessage message={status} tone="success" /> : null}

      {planningThreadCard}

      <div className="two-column">
        {currentPlan ? currentPlanCard : createDraftCard}
        {currentPlan ? createDraftCard : null}
      </div>

      {currentPlan ? (
        <div className="two-column">
          <Card title="Adjust this plan" eyebrow="Common changes">
            <div className="stack">
              <Field
                label="Peak week volume"
                hint={currentPlan.volumeMode === "time" ? "Minutes" : "Meters"}
              >
                <input
                  onChange={(event) => setPeakWeekVolume(event.target.value)}
                  type="number"
                  value={peakWeekVolume}
                />
              </Field>
              <Button
                kind="secondary"
                onClick={() =>
                  void run(
                    async () =>
                      currentPlan.status === "draft"
                        ? updateDraftPlanBasics({
                            planId: currentPlan._id,
                            peakWeekVolume: Number(peakWeekVolume),
                          })
                        : updatePlanPeakVolume({
                            planId: currentPlan._id,
                            peakWeekVolume: Number(peakWeekVolume),
                            reason: "Updated from web companion.",
                          }),
                    "Peak volume saved.",
                  )
                }
              >
                Save peak volume
              </Button>

              <div className="section-divider" />

              <div className="form-grid">
                <Field label="Goal type">
                  <select
                    onChange={(event) =>
                      setGoalEditType(event.target.value as "race" | "nonRace")
                    }
                    value={goalEditType}
                  >
                    <option value="race">Race</option>
                    <option value="nonRace">Non-race block</option>
                  </select>
                </Field>
                <Field label="Goal name">
                  <input
                    onChange={(event) => setGoalEditLabel(event.target.value)}
                    value={goalEditLabel}
                  />
                </Field>
                <Field label="Target date">
                  <input
                    onChange={(event) => setGoalEditDate(event.target.value)}
                    type="date"
                    value={goalEditDate}
                  />
                </Field>
                <Field label="Goal time">
                  <input
                    onChange={(event) => setGoalEditTime(event.target.value)}
                    placeholder="48:00"
                    value={goalEditTime}
                  />
                </Field>
              </div>
              <Button
                kind="secondary"
                onClick={() =>
                  void run(
                    async () =>
                      changePlanGoal({
                        planId: currentPlan._id,
                        goalType: goalEditType,
                        goalLabel: goalEditLabel,
                        targetDate: goalEditDate
                          ? new Date(`${goalEditDate}T00:00:00`).getTime()
                          : undefined,
                        goalTimeSeconds: goalEditTimeSeconds,
                        reason: "Updated from web companion.",
                      }),
                    "Goal update recorded.",
                  )
                }
              >
                Save goal change
              </Button>
            </div>
          </Card>

          <Card title="Pause or add races" eyebrow="Plan maintenance">
            <div className="stack">
              {currentPlan.status === "active" ? (
                <>
                  <div className="form-grid">
                    <Field label="Why this week needs a pause">
                      <select
                        onChange={(event) =>
                          setInterruptionType(event.target.value as InterruptionOption)
                        }
                        value={interruptionType}
                      >
                        {interruptionOptions.map((value) => (
                          <option key={value} value={value}>
                            {formatFriendlyLabel(value)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Note">
                      <input
                        onChange={(event) => setInterruptionNote(event.target.value)}
                        placeholder="Travel week, sickness, schedule change..."
                        value={interruptionNote}
                      />
                    </Field>
                  </div>
                  <Button
                    kind="secondary"
                    onClick={() =>
                      void run(
                        async () =>
                          reportPlanInterruption({
                            planId: currentPlan._id,
                            type: interruptionType,
                            note:
                              interruptionNote.trim() || "Marked from web companion.",
                          }),
                        "Interruption recorded.",
                      )
                    }
                  >
                    Save pause note
                  </Button>
                  <div className="section-divider" />
                </>
              ) : null}

              <div className="form-grid">
                <Field label="Tune-up race name">
                  <input
                    onChange={(event) => setRaceLabel(event.target.value)}
                    placeholder="Spring 10K"
                    value={raceLabel}
                  />
                </Field>
                <Field label="Race date">
                  <input
                    onChange={(event) => setRaceDate(event.target.value)}
                    type="date"
                    value={raceDate}
                  />
                </Field>
                <Field label="Distance">
                  <div className="inline-field">
                    <input
                      onChange={(event) => setRaceDistanceValue(event.target.value)}
                      type="number"
                      value={raceDistanceValue}
                    />
                    <select
                      onChange={(event) =>
                        setRaceDistanceUnit(event.target.value as DistanceUnitOption)
                      }
                      value={raceDistanceUnit}
                    >
                      {distanceUnitOptions.map((unit) => (
                        <option key={unit} value={unit}>
                          {formatFriendlyLabel(unit)}
                        </option>
                      ))}
                    </select>
                  </div>
                </Field>
                <Field label="Goal time">
                  <input
                    onChange={(event) => setRaceGoalTime(event.target.value)}
                    placeholder="45:00"
                    value={raceGoalTime}
                  />
                </Field>
              </div>
              <Button
                kind="secondary"
                disabled={!raceLabel.trim() || !raceDate || !raceDistanceMeters}
                onClick={() =>
                  void run(
                    async () => {
                      await upsertRace({
                        label: raceLabel,
                        plannedDate: new Date(`${raceDate}T00:00:00`).getTime(),
                        distanceMeters: raceDistanceMeters!,
                        goalTimeSeconds: raceGoalTimeSeconds,
                        isPrimaryGoal: false,
                        planId: currentPlan._id,
                      });
                      setRaceLabel("");
                      setRaceDate("");
                      setRaceGoalTime("");
                    },
                    "Race added.",
                  )
                }
              >
                Add race
              </Button>

              <div className="stack">
                {currentPlan.races.length > 0 ? (
                  currentPlan.races.map((race) => (
                    <div className="row-card" key={String(race._id)}>
                      <div>
                        <strong>{race.label}</strong>
                        <div>
                          {formatDateTime(race.plannedDate)}
                          {" · "}
                          {formatDistance(race.distanceMeters, session.user.unitPreference)}
                        </div>
                      </div>
                      {!race.isPrimaryGoal && !race.actualTimeSeconds ? (
                        <Button
                          kind="danger"
                          onClick={() =>
                            void run(
                              async () => deleteRace({ raceId: race._id }),
                              "Race removed.",
                            )
                          }
                        >
                          Remove
                        </Button>
                      ) : (
                        <span className="pill">
                          {race.isPrimaryGoal ? "Primary goal" : "Completed"}
                        </span>
                      )}
                    </div>
                  ))
                ) : (
                  <p>No races attached to this plan yet.</p>
                )}
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      <Card title="Past plans" eyebrow="History">
        {planView?.pastPlans.length ? (
          <div className="stack">
            {planView.pastPlans.map((plan) => (
              <div className="row-card" key={String(plan._id)}>
                <div>
                  <strong>Plan from {formatDateTime(plan.createdAt)}</strong>
                  <div>
                    {formatFriendlyLabel(plan.status)} · {plan.numberOfWeeks} weeks
                  </div>
                  <PlanAssessmentSummary
                    state={plan.assessment}
                    retrying={retryingAssessmentId === plan.assessment.request?._id}
                    onRetry={(requestId) => {
                      void (async () => {
                        setRetryingAssessmentId(requestId);
                        try {
                          await retryPlanAssessment({ requestId: requestId as Id<"aiRequests"> });
                        } finally {
                          setRetryingAssessmentId(null);
                        }
                      })();
                    }}
                  />
                </div>
                <div className="stack">
                  <span className="pill">
                    {formatVolume(
                      plan.volumeMode,
                      plan.peakWeekVolume,
                      session.user.unitPreference,
                    )}
                  </span>
                  <ActionLink kind="secondary" to={`/plan/history/${String(plan._id)}`}>
                    Open block
                  </ActionLink>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p>No completed or abandoned plans yet.</p>
        )}
      </Card>
    </Screen>
  );
}

export function WeekPage({ session }: { session: SessionData }) {
  const params = useParams();
  const weekNumber = Number(params.weekNumber ?? "1");
  const [nowBucketMs, setNowBucketMs] = useState(getWebTimeBucketMs);
  const planView = useQuery(api.planOverview.getPlanOverviewView, { nowBucketMs });
  const planId = planView?.activePlan?._id ?? planView?.draftPlans[0]?._id;
  const week = useQuery(
    api.weekDetail.getWeekDetailView,
    planId ? { planId, weekNumber, nowBucketMs } : "skip",
  );
  const weekBuilderView = useQuery(
    api.planning.getWeekBuilderView,
    planId ? { planId, weekNumber } : "skip",
  );
  const saveWeekAvailabilityOverride = useMutation(
    api.weekDetail.saveWeekAvailabilityOverride,
  );
  const clearWeekAvailabilityOverride = useMutation(
    api.weekDetail.clearWeekAvailabilityOverride,
  );
  const startWeekBuilderSession = useMutation(api.planning.startWeekBuilderSession);
  const sendWeekBuilderMessage = useMutation(api.planning.sendWeekBuilderMessage);
  const applyWeekDraft = useMutation(api.planning.applyWeekDraft);
  const toggleStrengthWorkout = useMutation(api.workoutDetail.toggleStrengthWorkout);
  const deleteRace = useMutation(api.weekDetail.deleteRace);
  const [overrideDays, setOverrideDays] = useState<Weekday[]>([]);
  const [note, setNote] = useState("");
  const [weekBuilderMessage, setWeekBuilderMessage] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setNowBucketMs(getWebTimeBucketMs());
    }, 60 * 1000);

    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!week?.week.availabilityOverride) {
      setOverrideDays([]);
      setNote("");
      return;
    }

    setOverrideDays(
      (week.week.availabilityOverride.preferredRunningDays ?? []) as Weekday[],
    );
    setNote(week.week.availabilityOverride.note ?? "");
  }, [week?.week._id, week?.week.availabilityOverride]);

  const run = async (task: () => Promise<unknown>, success: string) => {
    setError(null);
    setMessage(null);
    try {
      await task();
      setMessage(success);
    } catch (taskError) {
      setError(String(taskError));
    }
  };

  return (
    <Screen
      title={`Week ${weekNumber}`}
      subtitle="Review the schedule, generate workouts, and handle week-level changes."
      actions={<ActionLink kind="secondary" to="/plan">Back to plan</ActionLink>}
    >
      {message ? <StatusMessage message={message} tone="success" /> : null}
      {error ? <StatusMessage message={error} tone="error" /> : null}
      {!week ? <StatusMessage message="Loading week…" /> : null}
      {week ? (
        <>
          <Card
            title={`${week.plan.goalLabel} · ${week.week.emphasis}`}
            eyebrow={`Week ${week.week.weekNumber}`}
            actions={
              week.plan._id ? (
                <Button
                  onClick={() =>
                    void run(
                      async () =>
                        startWeekBuilderSession({
                          planId: week.plan._id,
                          weekNumber,
                          note: note.trim() || undefined,
                        }),
                      "Week builder started.",
                    )
                  }
                >
                  {weekBuilderView?.draft ? "Refresh with coach" : "Open week builder"}
                </Button>
              ) : undefined
            }
          >
            <div className="stack">
              <p>
                {formatDateKey(week.week.weekStartDateKey)} to{" "}
                {formatDateKey(week.week.weekEndDateKey)} · target{" "}
                {formatVolume(
                  week.plan.volumeMode,
                  week.week.targetVolumeAbsolute,
                  session.user.unitPreference,
                )}
              </p>
              {week.week.coachNotes ? <p>{week.week.coachNotes}</p> : null}
              {week.week.interruptionType ? (
                <div className="inset">
                  <strong>Adjustment on file</strong>
                  <p>
                    {formatFriendlyLabel(week.week.interruptionType)}
                    {week.week.interruptionNote
                      ? ` · ${week.week.interruptionNote}`
                      : ""}
                  </p>
                </div>
              ) : null}
            </div>
          </Card>

          <Card title="Week builder" eyebrow="Conversation">
            <div className="stack">
              {weekBuilderView?.draft?.latestPreviewText ? (
                <div className="inset">
                  <strong>Coach</strong>
                  <p>{weekBuilderView.draft.latestPreviewText}</p>
                </div>
              ) : (
                <p>Start the week builder to generate or revise this week conversationally.</p>
              )}
              {weekBuilderView?.messages?.length ? (
                <div className="stack">
                  {weekBuilderView.messages.map((entry) => (
                    <div className="row-card" key={entry._id}>
                      <div>
                        <strong>{entry.author === "assistant" ? "Coach" : "You"}</strong>
                        <div>{entry.body}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              <Field label="Adjust this week">
                <input
                  onChange={(event) => setWeekBuilderMessage(event.target.value)}
                  placeholder="Move the long run earlier, cut back Friday, account for travel..."
                  value={weekBuilderMessage}
                />
              </Field>
              <div className="inline-actions">
                <Button
                  kind="secondary"
                  disabled={!weekBuilderView?.draft || !weekBuilderMessage.trim()}
                  onClick={() =>
                    void run(
                      async () => {
                        const draft = weekBuilderView?.draft;
                        if (!draft) {
                          return;
                        }
                        await sendWeekBuilderMessage({
                          weekDraftId: draft._id as Id<"agentWeekDrafts">,
                          body: weekBuilderMessage,
                        });
                        setWeekBuilderMessage("");
                      },
                      "Coach is revising the week.",
                    )
                  }
                >
                  Send adjustment
                </Button>
                <Button
                  disabled={
                    !weekBuilderView?.draft ||
                    weekBuilderView.draft.validationStatus !== "valid"
                  }
                  onClick={() =>
                    void run(
                      async () =>
                        applyWeekDraft({
                          weekDraftId: weekBuilderView!.draft!._id as Id<"agentWeekDrafts">,
                        }),
                      "Week draft applied.",
                    )
                  }
                >
                  Apply week draft
                </Button>
              </div>
              {weekBuilderView?.draft?.latestObject ? (
                <div className="stack">
                  {(
                    weekBuilderView.draft.latestObject as {
                      workouts: Array<{
                        type: string;
                        scheduledDate: string;
                        venue: string;
                        notes?: string;
                      }>;
                    }
                  ).workouts.map((draftWorkout, index) => (
                    <div className="row-card" key={`${draftWorkout.scheduledDate}-${index}`}>
                      <div>
                        <strong>{formatFriendlyLabel(draftWorkout.type)}</strong>
                        <div>
                          {formatDateKey(draftWorkout.scheduledDate)} · {formatFriendlyLabel(draftWorkout.venue)}
                        </div>
                        {draftWorkout.notes ? <div>{draftWorkout.notes}</div> : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {weekBuilderView?.draft?.latestError ? (
                <StatusMessage message={weekBuilderView.draft.latestError} tone="error" />
              ) : null}
            </div>
          </Card>

          <div className="two-column">
            <Card title="Running workouts" eyebrow="Agenda">
              {week.workouts.length ? (
                <div className="stack">
                  {week.workouts.map((workout) => (
                    <Link
                      className="row-card link-card"
                      key={String(workout._id)}
                      to={`/plan/workout/${String(workout._id)}`}
                    >
                      <div>
                        <strong>{formatWorkoutType(workout.type)}</strong>
                        <div>
                          {formatDateKey(workout.scheduledDateKey)} ·{" "}
                          {formatVolume(
                            week.plan.volumeMode,
                            workout.absoluteVolume,
                            session.user.unitPreference,
                          )}
                        </div>
                      </div>
                      <span className="pill">
                        {workout.execution?.matchStatus === "matched"
                          ? "completed"
                          : formatFriendlyLabel(workout.status)}
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p>
                  {week.week.generated
                    ? "No running workouts are attached to this week."
                    : "Generate the week to see the workout schedule."}
                </p>
              )}
            </Card>

            <Card title="Availability override" eyebrow="Schedule changes">
              <div className="stack">
                <Field
                  label="Available days this week"
                  hint="Leave everything off if you only want to add a note."
                >
                  <DayPicker
                    days={overrideDays}
                    onToggle={(day) =>
                      setOverrideDays((current) => toggleArrayValue(day, current))
                    }
                  />
                </Field>
                <Field label="What changed this week?">
                  <textarea
                    onChange={(event) => setNote(event.target.value)}
                    rows={3}
                    value={note}
                  />
                </Field>
                <div className="button-row wrap">
                  <Button
                    onClick={() =>
                      void run(
                        async () =>
                          saveWeekAvailabilityOverride({
                            weekId: week.week._id,
                            preferredRunningDays:
                              overrideDays.length > 0 ? overrideDays : undefined,
                            note: note.trim() || undefined,
                          }),
                        "Week override saved.",
                      )
                    }
                  >
                    Save override
                  </Button>
                  <Button
                    kind="secondary"
                    onClick={() =>
                      void run(
                        async () =>
                          clearWeekAvailabilityOverride({
                            weekId: week.week._id,
                          }),
                        "Override cleared.",
                      )
                    }
                  >
                    Clear override
                  </Button>
                </div>
              </div>
            </Card>
          </div>

          <Card title="Strength and races" eyebrow="Extras">
            <div className="two-column">
              <div className="stack">
                <strong>Strength</strong>
                {week.strengthWorkouts.length ? (
                  week.strengthWorkouts.map((workout) => (
                    <div className="row-card" key={String(workout._id)}>
                      <div>
                        <strong>{workout.title}</strong>
                        <div>
                          {workout.plannedMinutes} min ·{" "}
                          {formatFriendlyLabel(workout.status)}
                        </div>
                      </div>
                      <Button
                        kind="secondary"
                        onClick={() =>
                          void run(
                            async () =>
                              toggleStrengthWorkout({
                                strengthWorkoutId: workout._id,
                                completed: workout.status !== "completed",
                              }),
                            "Strength workout updated.",
                          )
                        }
                      >
                        {workout.status === "completed" ? "Mark planned" : "Mark done"}
                      </Button>
                    </div>
                  ))
                ) : (
                  <p>No strength work this week.</p>
                )}
              </div>

              <div className="stack">
                <strong>Races</strong>
                {week.races.length ? (
                  week.races.map((race) => (
                    <div className="row-card" key={String(race._id)}>
                      <div>
                        <strong>{race.label}</strong>
                        <div>
                          {formatDateTime(race.plannedDate)} ·{" "}
                          {formatDistance(race.distanceMeters, session.user.unitPreference)}
                        </div>
                      </div>
                      {!race.isPrimaryGoal && !race.actualTimeSeconds ? (
                        <Button
                          kind="danger"
                          onClick={() =>
                            void run(
                              async () => deleteRace({ raceId: race._id }),
                              "Race removed.",
                            )
                          }
                        >
                          Remove
                        </Button>
                      ) : (
                        <span className="pill">
                          {race.isPrimaryGoal ? "Primary goal" : "Completed"}
                        </span>
                      )}
                    </div>
                  ))
                ) : (
                  <p>No races land in this week.</p>
                )}
              </div>
            </div>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

export function PastPlanPage({ session }: { session: SessionData }) {
  const params = useParams();
  const planId = params.planId as Id<"trainingPlans"> | undefined;
  const detail = useQuery(
    api.planAssessments.getPastPlanDetailView,
    planId ? { planId } : "skip",
  );
  const retryPlanAssessment = useMutation(api.coach.retryPlanAssessment);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  return (
    <Screen
      title={detail ? detail.plan.goalLabel : "Past plan"}
      subtitle="Read-only block history with the coach assessment attached."
      actions={<ActionLink kind="secondary" to="/plan">Back to plan</ActionLink>}
    >
      {message ? <StatusMessage message={message} tone="success" /> : null}
      {error ? <StatusMessage message={error} tone="error" /> : null}
      {!detail ? <StatusMessage message="Loading past plan…" /> : null}
      {detail ? (
        <>
          <Card
            title="Assessment"
            eyebrow={formatFriendlyLabel(detail.plan.status)}
          >
            <PlanAssessmentSummary
              state={detail.assessment}
              retrying={retrying}
              onRetry={(requestId) => {
                void (async () => {
                  setMessage(null);
                  setError(null);
                  setRetrying(true);
                  try {
                    await retryPlanAssessment({ requestId: requestId as Id<"aiRequests"> });
                    setMessage("Assessment retry queued.");
                  } catch (retryError) {
                    setError(String(retryError));
                  } finally {
                    setRetrying(false);
                  }
                })();
              }}
            />
          </Card>

          <Card title="Week structure" eyebrow="History">
            <div className="stack">
              {detail.weeks.map((week) => (
                <div className="row-card" key={String(week._id)}>
                  <div>
                    <strong>Week {week.weekNumber}</strong>
                    <div>
                      {Math.round(week.targetVolumePercent * 100)}% of peak
                      {" · "}
                      {week.emphasis || "No emphasis"}
                    </div>
                    <div>
                      {formatDateKey(week.weekStartDateKey)}
                      {" - "}
                      {formatDateKey(week.weekEndDateKey)}
                      {week.interruptionType
                        ? ` · ${formatFriendlyLabel(week.interruptionType)}`
                        : ""}
                    </div>
                    {week.coachNotes ? <p>{week.coachNotes}</p> : null}
                  </div>
                  <span className="pill">
                    {formatVolume(
                      detail.plan.volumeMode,
                      week.targetVolumeAbsolute,
                      session.user.unitPreference,
                    )}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

export function WorkoutPage({ session }: { session: SessionData }) {
  const params = useParams();
  const navigate = useNavigate();
  const workoutId = params.workoutId as Id<"workouts"> | undefined;
  const detail = useQuery(api.workoutDetail.getWorkoutDetailView, workoutId ? { workoutId } : "skip");
  const skipWorkout = useMutation(api.workoutDetail.skipWorkout);
  const rescheduleWorkout = useMutation(api.workoutDetail.rescheduleWorkout);
  const bumpWorkout = useMutation(api.workoutDetail.bumpWorkout);

  const [rescheduleDate, setRescheduleDate] = useState("");
  const [skipReason, setSkipReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!detail) {
      return;
    }

    if (detail.rescheduleOptions[0]) {
      setRescheduleDate(detail.rescheduleOptions[0]);
    }
  }, [detail?.workout._id, detail?.rescheduleOptions]);

  const run = async (task: () => Promise<unknown>, success: string) => {
    setMessage(null);
    setError(null);
    try {
      await task();
      setMessage(success);
    } catch (taskError) {
      setError(String(taskError));
    }
  };

  return (
    <Screen
      title={detail ? formatWorkoutType(detail.workout.type) : "Workout detail"}
      subtitle={
        detail
          ? `${formatDateKey(detail.workout.scheduledDateKey)} · Week ${detail.week.weekNumber}`
          : "Loading workout…"
      }
      actions={
        <Button
          kind="secondary"
          onClick={() =>
            detail ? navigate(`/plan/week/${detail.week.weekNumber}`) : navigate(-1)
          }
        >
          {detail ? `Week ${detail.week.weekNumber}` : "Back"}
        </Button>
      }
    >
      {message ? <StatusMessage message={message} tone="success" /> : null}
      {error ? <StatusMessage message={error} tone="error" /> : null}
      {!detail ? <StatusMessage message="Loading workout detail…" /> : null}
      {detail ? (
        <>
          <Card
            title="Workout summary"
            eyebrow={`${detail.plan.goalLabel} · ${detail.plan.volumeMode} mode`}
          >
            <div className="stack">
              <div className="mini-metrics">
                <div className="mini-stat">
                  <strong>
                    {formatVolume(
                      detail.plan.volumeMode,
                      detail.workout.absoluteVolume,
                      session.user.unitPreference,
                    )}
                  </strong>
                  <span>{Math.round(detail.workout.volumePercent * 100)}% of peak</span>
                </div>
                <div className="mini-stat">
                  <strong>{detail.workout.venue}</strong>
                  <span>venue</span>
                </div>
              </div>
              {detail.workout.notes ? (
                <p>{detail.workout.notes}</p>
              ) : null}
            </div>
          </Card>

          <Card title="Segments" eyebrow="Ordered from summary down into pace-zone detail.">
            <div className="stack">
              {detail.workout.segments.length > 0 ? (
                detail.workout.segments.map((segment, index) => (
                  <p key={`${segment.label}-${index}`}>
                    {formatWorkoutSegmentLine(
                      segment,
                      session.user.unitPreference,
                      detail.week.vdotAtGeneration,
                    )}
                  </p>
                ))
              ) : (
                <p>No structured segments were attached to this workout.</p>
              )}
            </div>
          </Card>

          <div className="two-column">
            <Card title="Actual run summary" eyebrow="After you run">
              {detail.executionDetail ? (
                <WorkoutExecutionDetail
                  executionId={detail.executionDetail.execution._id as Id<"workoutExecutions">}
                  unitPreference={session.user.unitPreference}
                />
              ) : (
                <p>
                  If the run was imported but not matched yet, review it from History and
                  link it there.
                </p>
              )}
            </Card>

            <Card title="Adjust the schedule" eyebrow="Before you run">
              <div className="stack">
                <Field label="Skip reason">
                  <input
                    onChange={(event) => setSkipReason(event.target.value)}
                    placeholder="Travel, fatigue, weather..."
                    value={skipReason}
                  />
                </Field>
                <div className="button-row wrap">
                  <Button
                    onClick={() =>
                      void run(
                        async () =>
                          skipWorkout({
                            workoutId: detail.workout._id,
                            reason: skipReason.trim() || undefined,
                          }),
                        "Workout skipped.",
                      )
                    }
                  >
                    Skip workout
                  </Button>
                  <Button
                    kind="secondary"
                    onClick={() =>
                      void run(
                        async () => bumpWorkout({ workoutId: detail.workout._id }),
                        "Workout bumped forward.",
                      )
                    }
                  >
                    Bump forward
                  </Button>
                </div>
                <Field label="Move to another day this week">
                  <select
                    onChange={(event) => setRescheduleDate(event.target.value)}
                    value={rescheduleDate}
                  >
                    {detail.rescheduleOptions.map((option) => (
                      <option key={option} value={option}>
                        {formatDateKey(option)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Button
                  kind="secondary"
                  onClick={() =>
                    void run(
                      async () =>
                        rescheduleWorkout({
                          workoutId: detail.workout._id,
                          newScheduledDateKey: rescheduleDate,
                        }),
                      "Workout rescheduled.",
                    )
                  }
                >
                  Save reschedule
                </Button>
              </div>
            </Card>
          </div>
        </>
      ) : null}
    </Screen>
  );
}

export function HistoryPage({ session }: { session: SessionData }) {
  const [filter, setFilter] = useState<"all" | "matched" | "needsReview" | "unplanned">(
    "all",
  );
  const historyCounts = useQuery(api.historyFeed.getHistoryFeedView, {});
  const historyFeed = usePaginatedQuery(
    api.historyFeed.listHistoryFeedPage,
    { filter },
    { initialNumItems: WEB_HISTORY_PAGE_SIZE },
  );
  const totalItemsForFilter =
    filter === "all"
      ? (historyCounts?.matched ?? 0) +
        (historyCounts?.needsReview ?? 0) +
        (historyCounts?.unplanned ?? 0)
      : filter === "matched"
        ? (historyCounts?.matched ?? 0)
        : filter === "needsReview"
          ? (historyCounts?.needsReview ?? 0)
          : (historyCounts?.unplanned ?? 0);
  const isLoadingMore = historyFeed.status === "LoadingMore";
  const canLoadMore = historyFeed.status === "CanLoadMore";

  return (
    <Screen
      title="History"
      subtitle="Use this page to clear matching issues and review what actually happened."
    >
      <Card title="Import boundary" eyebrow="Managed on iPhone">
        <p>
          Workout import still starts on iPhone. The web app is for reviewing,
          matching, and adding context once the data is synced.
        </p>
      </Card>
      {historyFeed.status === "LoadingFirstPage" ? <StatusMessage message="Loading history…" /> : null}
      {historyCounts ? (
        <>
          <div className="two-column">
            <Card title="Filters" eyebrow="Feed">
              <div className="pill-row wrap">
                {(["all", "matched", "needsReview", "unplanned"] as const).map((value) => (
                  <button
                    key={value}
                    className={cx("pill-button", filter === value && "pill-button-active")}
                    onClick={() => setFilter(value)}
                    type="button"
                  >
                    {formatFriendlyLabel(value)}
                  </button>
                ))}
              </div>
              <div className="mini-metrics">
                <div className="mini-stat">
                  <strong>{historyCounts.matched}</strong>
                  <span>matched</span>
                </div>
                <div className="mini-stat">
                  <strong>{historyCounts.needsReview}</strong>
                  <span>needs review</span>
                </div>
                <div className="mini-stat">
                  <strong>{historyCounts.unplanned}</strong>
                  <span>unplanned</span>
                </div>
              </div>
            </Card>

            <Card title="Priority" eyebrow="Fix first">
              {(historyCounts.needsReview ?? 0) > 0 ? (
                <div className="stack">
                  <p>
                    You have runs waiting for match review. Clear those first so the
                    plan and coach feedback stay accurate.
                  </p>
                  <Button onClick={() => setFilter("needsReview")}>Show needs review</Button>
                </div>
              ) : (
                <p>No runs currently need review.</p>
              )}
            </Card>
          </div>

          <Card title="Recent runs" eyebrow="Feed items">
            {historyFeed.results.length ? (
              <div className="stack">
                {historyFeed.results.map((workout) => (
                  <Link
                    className="row-card link-card"
                    key={String(workout._id)}
                    to={`/history/${String(workout._id)}`}
                  >
                    <div>
                      <strong>{formatDateTime(workout.startedAt)}</strong>
                      <div>
                        {formatDistance(workout.distanceMeters, session.user.unitPreference)}
                        {" · "}
                        {formatDuration(workout.durationSeconds)}
                        {" · pace "}
                        {formatPace(workout.rawPaceSecondsPerMeter, session.user.unitPreference)}
                      </div>
                    </div>
                    <span className="pill">{formatFriendlyLabel(workout.status)}</span>
                  </Link>
                ))}
                {canLoadMore ? (
                  <Button disabled={isLoadingMore} onClick={() => historyFeed.loadMore(WEB_HISTORY_PAGE_SIZE)}>
                    {isLoadingMore ? "Loading next 10…" : "Load next 10"}
                  </Button>
                ) : null}
                {historyFeed.status === "Exhausted" && totalItemsForFilter > 0 ? (
                  <p>{`Showing all ${historyFeed.results.length} workouts for this filter.`}</p>
                ) : null}
              </div>
            ) : historyFeed.status === "LoadingFirstPage" ? null : (
              <p>No workouts match the current filter.</p>
            )}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

export function HistoryWorkoutPage({ session }: { session: SessionData }) {
  const params = useParams();
  const healthKitWorkoutId = params.healthKitWorkoutId as
    | Id<"healthKitWorkouts">
    | undefined;
  const detail = useQuery(
    api.historyDetail.getHistoryDetailView,
    healthKitWorkoutId ? { healthKitWorkoutId } : "skip",
  );
  const reconcileImportedWorkout = useMutation(api.workoutDetail.reconcileImportedWorkout);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (task: () => Promise<unknown>, success: string) => {
    setMessage(null);
    setError(null);
    try {
      await task();
      setMessage(success);
    } catch (taskError) {
      setError(String(taskError));
    }
  };

  return (
    <Screen
      title="Imported run detail"
      subtitle="Decide whether this run belongs to a planned workout and add context when needed."
      actions={<ActionLink kind="secondary" to="/history">Back to history</ActionLink>}
    >
      {message ? <StatusMessage message={message} tone="success" /> : null}
      {error ? <StatusMessage message={error} tone="error" /> : null}
      {!detail ? <StatusMessage message="Loading run detail…" /> : null}
      {detail ? (
        <>
          <Card title={formatDateTime(detail.workout.startedAt)} eyebrow="Run summary">
            <div className="stack">
              <p>
                {formatDistance(detail.workout.distanceMeters, session.user.unitPreference)}
                {" · "}
                {formatDuration(detail.workout.durationSeconds)}
                {" · pace "}
                {formatPace(detail.workout.rawPaceSecondsPerMeter, session.user.unitPreference)}
              </p>
              <div className="button-row wrap">
                <Button
                  kind="secondary"
                  onClick={() =>
                    void run(
                      async () =>
                        reconcileImportedWorkout({
                          healthKitWorkoutId: detail.workout._id,
                        }),
                      "Auto-reconcile attempted.",
                    )
                  }
                >
                  Try automatic match
                </Button>
              </div>
            </div>
          </Card>

          {detail.executionDetail ? (
            <Card title="Reconcile and review" eyebrow="Execution detail">
              <WorkoutExecutionDetail
                allowMatchControls
                executionId={detail.executionDetail.execution._id as Id<"workoutExecutions">}
                unitPreference={session.user.unitPreference}
              />
            </Card>
          ) : null}

          {detail.workout.intervals?.length ? (
            <Card title="Lap detail" eyebrow="History">
              <WorkoutLapList
                intervals={detail.workout.intervals}
                unitPreference={session.user.unitPreference}
              />
            </Card>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

export function CoachPage() {
  const [nowBucketMs, setNowBucketMs] = useState(getWebTimeBucketMs);
  const coachView = useQuery(api.coachInbox.getCoachInboxView, { nowBucketMs }) as CoachInboxView | undefined;
  const sendCoachMessage = useMutation(api.coach.sendCoachMessage);
  const retryPlanAssessment = useMutation(api.coach.retryPlanAssessment);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [retryingAssessmentId, setRetryingAssessmentId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setNowBucketMs(getWebTimeBucketMs());
    }, 60 * 1000);

    return () => clearInterval(intervalId);
  }, []);

  const runSend = async (body?: string) => {
    const nextBody = (body ?? draft).trim();
    if (!nextBody) {
      return;
    }

    setMessage(null);
    setError(null);
    setSending(true);
    try {
      await sendCoachMessage({ body: nextBody });
      if (!body) {
        setDraft("");
      }
      setMessage("Message sent.");
    } catch (sendError) {
      setError(String(sendError));
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen
      title="Coach"
      subtitle="Keep the conversation close to the rest of the training workflow."
    >
      {message ? <StatusMessage message={message} tone="success" /> : null}
      {error ? <StatusMessage message={error} tone="error" /> : null}
      {!coachView ? <StatusMessage message="Loading coach…" /> : null}
      {coachView ? (
        <>
          <div className="two-column">
            <Card title="Current context" eyebrow="Now">
              <p>
                {coachView.activePlan
                  ? `${coachView.activePlan.goalLabel} · week ${
                      coachView.activePlan.currentWeekNumber ?? "—"
                    }`
                  : "No active plan"}
                {" · "}
                {typeof coachView.currentVDOT === "number"
                  ? `VDOT ${coachView.currentVDOT.toFixed(1)}`
                  : "No VDOT"}
              </p>
            </Card>

            <Card title="Quick prompts" eyebrow="Start a conversation">
              <div className="pill-row wrap">
                {coachView.suggestedPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    className="pill-button"
                    disabled={sending}
                    onClick={() => void runSend(prompt)}
                    type="button"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </Card>
          </div>

          {coachView.latestAssessment ? (
            <Card
              title={`${coachView.latestAssessment.planLabel} assessment`}
              eyebrow="Latest block"
              actions={
                <ActionLink kind="secondary" to={`/plan/history/${coachView.latestAssessment.planId}`}>
                  Open block
                </ActionLink>
              }
            >
              <PlanAssessmentSummary
                state={coachView.latestAssessment.state}
                retrying={retryingAssessmentId === coachView.latestAssessment.state.request?._id}
                onRetry={(requestId) => {
                  void (async () => {
                    setRetryingAssessmentId(requestId);
                    try {
                      await retryPlanAssessment({ requestId: requestId as Id<"aiRequests"> });
                    } finally {
                      setRetryingAssessmentId(null);
                    }
                  })();
                }}
              />
            </Card>
          ) : null}

          <Card title="Conversation" eyebrow="Messages">
            {coachView.messages.length ? (
              <div className="chat-list">
                {coachView.messages.map((entry) => (
                  <div
                    className={cx(
                      "chat-bubble",
                      entry.author === "user" ? "chat-user" : "chat-coach",
                    )}
                    key={String(entry._id)}
                  >
                    <div className="chat-meta">
                      <strong>{entry.author === "user" ? "You" : "Coach"}</strong>
                      <span>{formatDateTime(entry.createdAt)}</span>
                    </div>
                    <p>{entry.body}</p>
                    {entry.cta ? <span className="pill">{entry.cta.label}</span> : null}
                  </div>
                ))}
              </div>
            ) : (
              <p>No messages yet. Ask anything about your training.</p>
            )}
          </Card>

          <Card title="Message coach" eyebrow="Compose">
            <Field label="Draft">
              <textarea
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Ask about today’s workout, a plan change, or how training is going."
                rows={5}
                value={draft}
              />
            </Field>
            <div className="button-row wrap">
              <Button
                disabled={sending || draft.trim().length === 0}
                onClick={() => void runSend()}
              >
                {sending ? "Sending…" : "Send"}
              </Button>
              {coachPromptPresets.map((prompt) => (
                <button
                  key={prompt}
                  className="pill-button"
                  disabled={sending}
                  onClick={() => setDraft(prompt)}
                  type="button"
                >
                  Fill: {prompt}
                </button>
              ))}
            </div>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

export function SettingsPage({
  session,
  onRefresh,
}: {
  session: SessionData;
  onRefresh: () => Promise<void>;
}) {
  const settings = useQuery(api.settings.getSettingsView, {});
  const updateName = useMutation(api.settings.updateName);
  const updateUnitPreference = useMutation(api.settings.updateUnitPreference);
  const updateVolumePreference = useMutation(api.settings.updateVolumePreference);
  const updateTrackAccess = useMutation(api.settings.updateTrackAccess);
  const updateRunningSchedule = useMutation(api.settings.updateRunningSchedule);
  const updateCompetitiveness = useMutation(api.settings.updateCompetitiveness);
  const updatePersonality = useMutation(api.settings.updatePersonality);
  const updateStrengthPreferences = useMutation(api.settings.updateStrengthPreferences);
  const upsertCourse = useMutation(api.settings.upsertCourse);
  const deleteCourse = useMutation(api.settings.deleteCourse);
  const upsertRace = useMutation(api.settings.upsertRace);
  const deleteRace = useMutation(api.settings.deleteRace);
  const exportData = useQuery(api.settings.exportData, {});
  const resetAppData = useMutation(api.settings.resetAppData);

  const [name, setName] = useState(session.user.name);
  const [unitPreference, setUnitPreference] = useState<UnitPreference>(
    session.user.unitPreference,
  );
  const [volumePreference, setVolumePreference] = useState<VolumeMode>(
    session.user.volumePreference,
  );
  const [trackAccess, setTrackAccess] = useState(session.user.trackAccess);
  const [runningDays, setRunningDays] = useState<Weekday[]>(weekdayOptions);
  const [runningDaysPerWeek, setRunningDaysPerWeek] = useState(5);
  const [longRunDay, setLongRunDay] = useState<Weekday | "">("");
  const [qualityDays, setQualityDays] = useState<Weekday[]>([]);
  const [competitiveness, setCompetitiveness] = useState<CompetitivenessLevel>("balanced");
  const [personality, setPersonality] = useState<PersonalityPreset>("noNonsense");
  const [customPersonality, setCustomPersonality] = useState("");
  const [strengthEnabled, setStrengthEnabled] = useState(false);
  const [strengthEquipment, setStrengthEquipment] = useState<StrengthEquipmentOption[]>([]);
  const [courseName, setCourseName] = useState("");
  const [courseDistanceValue, setCourseDistanceValue] = useState("1");
  const [courseDistanceUnit, setCourseDistanceUnit] = useState<DistanceUnitOption>("miles");
  const [courseSurface, setCourseSurface] = useState<SurfaceOption>("road");
  const [courseNotes, setCourseNotes] = useState("");
  const [raceLabel, setRaceLabel] = useState("");
  const [raceDate, setRaceDate] = useState("");
  const [raceDistanceValue, setRaceDistanceValue] = useState("5");
  const [raceDistanceUnit, setRaceDistanceUnit] = useState<DistanceUnitOption>("kilometers");
  const [raceGoalTime, setRaceGoalTime] = useState("");
  const [raceActualTime, setRaceActualTime] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) {
      return;
    }

    setName(settings.user?.name ?? session.user.name);
    setUnitPreference((settings.user?.unitPreference ?? "system") as UnitPreference);
    setVolumePreference((settings.user?.volumePreference ?? "time") as VolumeMode);
    setTrackAccess(settings.user?.trackAccess ?? false);
    setRunningDays(settings.runningSchedule?.preferredRunningDays ?? weekdayOptions);
    setRunningDaysPerWeek(settings.runningSchedule?.runningDaysPerWeek ?? 5);
    setLongRunDay((settings.runningSchedule?.preferredLongRunDay ?? "") as Weekday | "");
    setQualityDays(settings.runningSchedule?.preferredQualityDays ?? []);
    setCompetitiveness((settings.competitiveness?.level ?? "balanced") as CompetitivenessLevel);
    setPersonality((settings.personality?.name ?? "noNonsense") as PersonalityPreset);
    setCustomPersonality(
      settings.personality?.name === "custom"
        ? settings.personality.description ?? ""
        : "",
    );
    setStrengthEnabled(settings.strengthPreference.enabled);
    setStrengthEquipment(settings.strengthPreference.equipment as StrengthEquipmentOption[]);
  }, [
    settings?.user?.updatedAt,
    settings?.runningSchedule?.updatedAt,
    settings?.competitiveness?.updatedAt,
    settings?.personality?.updatedAt,
    session.user.name,
  ]);

  const run = async (task: () => Promise<unknown>, success: string) => {
    setMessage(null);
    setError(null);
    try {
      await task();
      setMessage(success);
      await onRefresh();
    } catch (taskError) {
      setError(String(taskError));
    }
  };

  const saveProfile = async () => {
    if (!settings) {
      return;
    }

    if (name.trim() !== (settings.user?.name ?? "").trim()) {
      await updateName({ name });
    }

    if (unitPreference !== settings.user?.unitPreference) {
      await updateUnitPreference({ unitPreference });
    }

    if (volumePreference !== settings.user?.volumePreference) {
      await updateVolumePreference({ volumePreference });
    }

    if (trackAccess !== settings.user?.trackAccess) {
      await updateTrackAccess({ trackAccess });
    }
  };

  const saveSchedule = async () => {
    if (!settings) {
      return;
    }

    await updateRunningSchedule({
      preferredRunningDays: runningDays,
      runningDaysPerWeek: clampRunningDaysPerWeek(runningDaysPerWeek, runningDays),
      preferredLongRunDay: longRunDay || undefined,
      preferredQualityDays: qualityDays.filter((day) => runningDays.includes(day)),
      availabilityWindows: settings.runningSchedule?.availabilityWindows,
    });
  };

  const saveCoaching = async () => {
    if (!settings) {
      return;
    }

    if (competitiveness !== settings.competitiveness?.level) {
      await updateCompetitiveness({ level: competitiveness });
    }

    if (
      personality !== settings.personality?.name ||
      (personality === "custom" &&
        customPersonality.trim() !== (settings.personality?.description ?? "").trim())
    ) {
      await updatePersonality({
        preset: personality,
        customDescription: personality === "custom" ? customPersonality.trim() : undefined,
      });
    }

    const currentEquipment = settings.strengthPreference.equipment.join(",");
    const nextEquipment = strengthEquipment.join(",");
    if (
      strengthEnabled !== settings.strengthPreference.enabled ||
      currentEquipment !== nextEquipment
    ) {
      await updateStrengthPreferences({
        enabled: strengthEnabled,
        equipment: strengthEquipment,
      });
    }
  };

  const downloadExport = () => {
    if (!exportData) {
      return;
    }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `slopmiles-export-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const courseDistanceMeters = toMeters(courseDistanceValue, courseDistanceUnit);
  const raceDistanceMeters = toMeters(raceDistanceValue, raceDistanceUnit);

  return (
    <Screen
      title="Settings"
      subtitle="Edit the profile and scheduling inputs that shape the rest of the app."
    >
      {message ? <StatusMessage message={message} tone="success" /> : null}
      {error ? <StatusMessage message={error} tone="error" /> : null}
      {!settings ? <StatusMessage message="Loading settings…" /> : null}
      {settings ? (
        <>
          <Card title="Integrations" eyebrow="HealthKit">
            <div className="stack">
              <p>
                HealthKit import is{" "}
                {SETTINGS_COMPONENT_CAPABILITIES.healthKitImport === "mobile-only"
                  ? "managed on iPhone."
                  : "available on every client."}
              </p>
              <p>
                Status: {settings.healthKit.authorized ? "Connected" : "Not connected"}
                {settings.healthKit.lastSyncAt
                  ? ` · last sync ${formatDateTime(settings.healthKit.lastSyncAt)}`
                  : ""}
                {settings.healthKit.lastSyncSource
                  ? ` via ${settings.healthKit.lastSyncSource}`
                  : ""}
              </p>
              {settings.healthKit.lastSyncError ? (
                <p>Latest sync issue: {settings.healthKit.lastSyncError}</p>
              ) : null}
            </div>
          </Card>

          <div className="two-column">
            <Card title="Profile" eyebrow="Account">
              <div className="stack">
                <div className="form-grid">
                  <Field label="Name">
                    <input onChange={(event) => setName(event.target.value)} value={name} />
                  </Field>
                  <Field label="Units">
                    <select
                      onChange={(event) =>
                        setUnitPreference(event.target.value as UnitPreference)
                      }
                      value={unitPreference}
                    >
                      <option value="system">System</option>
                      <option value="metric">Metric</option>
                      <option value="imperial">Imperial</option>
                    </select>
                  </Field>
                  <Field label="Default volume mode">
                    <select
                      onChange={(event) =>
                        setVolumePreference(event.target.value as VolumeMode)
                      }
                      value={volumePreference}
                    >
                      <option value="time">Time</option>
                      <option value="distance">Distance</option>
                    </select>
                  </Field>
                  <Field label="Track access">
                    <select
                      onChange={(event) => setTrackAccess(event.target.value === "yes")}
                      value={trackAccess ? "yes" : "no"}
                    >
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </Field>
                </div>
                <Button onClick={() => void run(saveProfile, "Profile saved.")}>
                  Save profile
                </Button>
              </div>
            </Card>

            <Card title="Coaching defaults" eyebrow="Coach">
              <div className="stack">
                <Field label="Competitiveness">
                  <div className="pill-row wrap">
                    {(["conservative", "balanced", "aggressive"] as CompetitivenessLevel[]).map(
                      (level) => (
                        <button
                          key={level}
                          className={cx(
                            "pill-button",
                            competitiveness === level && "pill-button-active",
                          )}
                          onClick={() => setCompetitiveness(level)}
                          type="button"
                        >
                          {formatFriendlyLabel(level)}
                        </button>
                      ),
                    )}
                  </div>
                </Field>
                <Field label="Coach personality">
                  <div className="pill-row wrap">
                    {(
                      ["cheerleader", "noNonsense", "nerd", "zen", "custom"] as PersonalityPreset[]
                    ).map((preset) => (
                      <button
                        key={preset}
                        className={cx(
                          "pill-button",
                          personality === preset && "pill-button-active",
                        )}
                        onClick={() => setPersonality(preset)}
                        type="button"
                      >
                        {formatFriendlyLabel(preset)}
                      </button>
                    ))}
                  </div>
                </Field>
                {personality === "custom" ? (
                  <Field label="Custom personality">
                    <textarea
                      onChange={(event) => setCustomPersonality(event.target.value)}
                      rows={4}
                      value={customPersonality}
                    />
                  </Field>
                ) : null}
                <label className="toggle">
                  <input
                    checked={strengthEnabled}
                    onChange={(event) => setStrengthEnabled(event.target.checked)}
                    type="checkbox"
                  />
                  <span>Include strength by default.</span>
                </label>
                {strengthEnabled ? (
                  <div className="pill-row wrap">
                    {strengthEquipmentOptions.map((item) => (
                      <button
                        key={item}
                        className={cx(
                          "pill-button",
                          strengthEquipment.includes(item) && "pill-button-active",
                        )}
                        onClick={() =>
                          setStrengthEquipment((current) => toggleArrayValue(item, current))
                        }
                        type="button"
                      >
                        {formatFriendlyLabel(item)}
                      </button>
                    ))}
                  </div>
                ) : null}
                <Button onClick={() => void run(saveCoaching, "Coaching defaults saved.")}>
                  Save coaching defaults
                </Button>
              </div>
            </Card>
          </div>

          <Card title="Running schedule" eyebrow="Availability">
            <div className="stack">
              <Field label="Days you can run">
                <DayPicker
                  days={runningDays}
                  onToggle={(day) =>
                    setRunningDays((current) => toggleArrayValue(day, current))
                  }
                />
              </Field>
              <div className="form-grid">
                <Field label="Run days per week">
                  <input
                    max={runningDays.length || 1}
                    min={1}
                    onChange={(event) => setRunningDaysPerWeek(Number(event.target.value))}
                    type="number"
                    value={runningDaysPerWeek}
                  />
                </Field>
                <Field label="Preferred long run day">
                  <select
                    onChange={(event) => setLongRunDay(event.target.value as Weekday | "")}
                    value={longRunDay}
                  >
                    <option value="">Coach decides</option>
                    {runningDays.map((day) => (
                      <option key={day} value={day}>
                        {formatWeekdayLabel(day)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Preferred quality days">
                <div className="pill-row wrap">
                  {runningDays.map((day) => (
                    <button
                      key={day}
                      className={cx(
                        "pill-button",
                        qualityDays.includes(day) && "pill-button-active",
                      )}
                      onClick={() =>
                        setQualityDays((current) => toggleArrayValue(day, current))
                      }
                      type="button"
                    >
                      {formatWeekdayShort(day)}
                    </button>
                  ))}
                </div>
              </Field>
              <p className="helper-text">
                Availability windows are not editable on web yet, so existing time
                windows stay preserved when you save this section.
              </p>
              <Button onClick={() => void run(saveSchedule, "Running schedule saved.")}>
                Save schedule
              </Button>
            </div>
          </Card>

          <div className="two-column">
            <Card title="Courses" eyebrow="Measured routes">
              <div className="stack">
                {settings.courses.length ? (
                  settings.courses.map((course) => (
                    <div className="row-card" key={String(course._id)}>
                      <div>
                        <strong>{course.name}</strong>
                        <div>
                          {formatDistance(course.distanceMeters, session.user.unitPreference)}
                          {" · "}
                          {formatFriendlyLabel(course.surface)}
                        </div>
                        {course.notes ? <div>{course.notes}</div> : null}
                      </div>
                      <Button
                        kind="danger"
                        onClick={() =>
                          void run(
                            async () => deleteCourse({ courseId: course._id }),
                            "Course removed.",
                          )
                        }
                      >
                        Delete
                      </Button>
                    </div>
                  ))
                ) : (
                  <p>No saved courses yet.</p>
                )}

                <div className="section-divider" />

                <div className="form-grid">
                  <Field label="Course name">
                    <input
                      onChange={(event) => setCourseName(event.target.value)}
                      placeholder="Neighborhood loop"
                      value={courseName}
                    />
                  </Field>
                  <Field label="Surface">
                    <select
                      onChange={(event) => setCourseSurface(event.target.value as SurfaceOption)}
                      value={courseSurface}
                    >
                      {surfaceOptions.map((surface) => (
                        <option key={surface} value={surface}>
                          {formatFriendlyLabel(surface)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Distance">
                    <div className="inline-field">
                      <input
                        onChange={(event) => setCourseDistanceValue(event.target.value)}
                        type="number"
                        value={courseDistanceValue}
                      />
                      <select
                        onChange={(event) =>
                          setCourseDistanceUnit(event.target.value as DistanceUnitOption)
                        }
                        value={courseDistanceUnit}
                      >
                        {distanceUnitOptions.map((unit) => (
                          <option key={unit} value={unit}>
                            {formatFriendlyLabel(unit)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </Field>
                  <Field label="Notes">
                    <input
                      onChange={(event) => setCourseNotes(event.target.value)}
                      value={courseNotes}
                    />
                  </Field>
                </div>
                <Button
                  disabled={!courseName.trim() || !courseDistanceMeters}
                  kind="secondary"
                  onClick={() =>
                    void run(
                      async () => {
                        await upsertCourse({
                          name: courseName,
                          distanceMeters: courseDistanceMeters!,
                          distanceUnit: courseDistanceUnit,
                          surface: courseSurface,
                          notes: courseNotes.trim() || undefined,
                        });
                        setCourseName("");
                        setCourseNotes("");
                      },
                      "Course saved.",
                    )
                  }
                >
                  Save course
                </Button>
              </div>
            </Card>

            <Card title="Race results" eyebrow="History">
              <div className="stack">
                {settings.races.length ? (
                  settings.races.map((race) => (
                    <div className="row-card" key={String(race._id)}>
                      <div>
                        <strong>{race.label}</strong>
                        <div>
                          {formatDateTime(race.plannedDate)}
                          {" · "}
                          {formatDistance(race.distanceMeters, session.user.unitPreference)}
                          {race.actualTimeSeconds
                            ? ` · ${formatRaceTime(race.actualTimeSeconds)}`
                            : ""}
                        </div>
                      </div>
                      {!race.isPrimaryGoal && !race.actualTimeSeconds ? (
                        <Button
                          kind="danger"
                          onClick={() =>
                            void run(
                              async () => deleteRace({ raceId: race._id }),
                              "Race removed.",
                            )
                          }
                        >
                          Delete
                        </Button>
                      ) : (
                        <span className="pill">
                          {race.isPrimaryGoal ? "Primary goal" : "Result saved"}
                        </span>
                      )}
                    </div>
                  ))
                ) : (
                  <p>No race results saved yet.</p>
                )}

                <div className="section-divider" />

                <div className="form-grid">
                  <Field label="Race label">
                    <input
                      onChange={(event) => setRaceLabel(event.target.value)}
                      placeholder="Local 5K"
                      value={raceLabel}
                    />
                  </Field>
                  <Field label="Date">
                    <input
                      onChange={(event) => setRaceDate(event.target.value)}
                      type="date"
                      value={raceDate}
                    />
                  </Field>
                  <Field label="Distance">
                    <div className="inline-field">
                      <input
                        onChange={(event) => setRaceDistanceValue(event.target.value)}
                        type="number"
                        value={raceDistanceValue}
                      />
                      <select
                        onChange={(event) =>
                          setRaceDistanceUnit(event.target.value as DistanceUnitOption)
                        }
                        value={raceDistanceUnit}
                      >
                        {distanceUnitOptions.map((unit) => (
                          <option key={unit} value={unit}>
                            {formatFriendlyLabel(unit)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </Field>
                  <Field label="Goal time">
                    <input
                      onChange={(event) => setRaceGoalTime(event.target.value)}
                      placeholder="20:00"
                      value={raceGoalTime}
                    />
                  </Field>
                  <Field label="Actual time">
                    <input
                      onChange={(event) => setRaceActualTime(event.target.value)}
                      placeholder="20:35"
                      value={raceActualTime}
                    />
                  </Field>
                  <Field label="Attach to active plan">
                    <select defaultValue="no" disabled>
                      <option value="no">
                        {settings.hasActivePlan ? "Add from Plan page instead" : "No active plan"}
                      </option>
                    </select>
                  </Field>
                </div>
                <Button
                  disabled={!raceLabel.trim() || !raceDate || !raceDistanceMeters}
                  kind="secondary"
                  onClick={() =>
                    void run(
                      async () => {
                        await upsertRace({
                          label: raceLabel,
                          plannedDate: new Date(`${raceDate}T00:00:00`).getTime(),
                          distanceMeters: raceDistanceMeters!,
                          goalTimeSeconds: parseDurationInput(raceGoalTime),
                          actualTimeSeconds: parseDurationInput(raceActualTime),
                          isPrimaryGoal: false,
                        });
                        setRaceLabel("");
                        setRaceDate("");
                        setRaceGoalTime("");
                        setRaceActualTime("");
                      },
                      "Race saved.",
                    )
                  }
                >
                  Save race
                </Button>
              </div>
            </Card>
          </div>

          <Card title="Data management" eyebrow="Portability">
            <div className="stack">
              <div className="button-row wrap">
                <Button disabled={!exportData} onClick={downloadExport}>
                  Export my data
                </Button>
                <Button
                  kind="danger"
                  onClick={() => void run(async () => resetAppData({}), "App data reset.")}
                >
                  Reset app
                </Button>
              </div>
              <p>
                Export downloads JSON in the browser. Reset clears app-owned Convex
                data and restarts onboarding.
              </p>
            </div>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
