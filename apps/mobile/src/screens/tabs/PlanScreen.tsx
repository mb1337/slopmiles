import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import {
  PLAN_INTERRUPTION_TYPES,
  WEEKDAYS,
  VOLUME_MODES,
  formatDateKeyForDisplay,
  formatDistanceForDisplay,
  formatResolvedPaceTargetForDisplay,
  formatWorkoutTypeLabel,
  type UnitPreference,
  type VolumeMode,
} from "@slopmiles/domain";

import { api, type Id } from "../../convex";
import {
  ChoiceRow,
  CrossPlatformPickerSheet,
  EmptyStateCard,
  FieldGroup,
  MetricGrid,
  MetricStat,
  PickerField,
  PrimaryButton,
  ScreenHeader,
  SectionCard,
  SecondaryButton,
  StatusBanner,
  StickyActionBar,
  TagGrid,
} from "../../components/common";
import { WorkoutExecutionDetail } from "../../components/workoutExecution";
import { PlanAssessmentSummary } from "../../components/assessment";
import { styles } from "../../styles";
import type { PlanRoute } from "../../types";

const RACE_GOALS = ["5K", "10K", "Half Marathon", "Marathon", "Custom"] as const;
const NON_RACE_GOALS = ["Base Building", "Recovery", "Custom"] as const;
const PLAN_GOAL_TYPES = ["race", "nonRace"] as const;
const PLAN_TIME_BUCKET_MS = 15 * 60 * 1000;
const WEEKDAY_LABELS: Record<(typeof WEEKDAYS)[number], string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

type PlanGoalType = (typeof PLAN_GOAL_TYPES)[number];

function getPlanTimeBucketMs() {
  return Math.floor(Date.now() / PLAN_TIME_BUCKET_MS) * PLAN_TIME_BUCKET_MS;
}

function formatGoalTime(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainder = rounded % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  }

  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function formatDurationSeconds(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  if (minutes === 0) {
    return `${remainder}s`;
  }
  if (remainder === 0) {
    return `${minutes} min`;
  }
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function formatSegment(segment: {
  label: string;
  paceZone: string;
  targetValue: number;
  targetUnit: "seconds" | "meters";
  repetitions?: number;
  restValue?: number;
  restUnit?: "seconds" | "meters";
}, unitPreference: UnitPreference, vdotAtGeneration?: number): string {
  const target = segment.targetUnit === "seconds" ? formatDurationSeconds(segment.targetValue) : `${Math.round(segment.targetValue)}m`;
  const reps = segment.repetitions ? `${segment.repetitions} x ` : "";
  const rest =
    typeof segment.restValue === "number" && segment.restUnit
      ? ` / ${segment.restUnit === "seconds" ? formatDurationSeconds(segment.restValue) : `${Math.round(segment.restValue)}m`} easy`
      : "";
  const explicitPace = formatResolvedPaceTargetForDisplay(vdotAtGeneration ?? null, segment.paceZone, unitPreference);
  const paceLabel = explicitPace ? `${segment.paceZone} (${explicitPace})` : segment.paceZone;

  return `${segment.label}: ${reps}${target} @ ${paceLabel}${rest}`;
}

function formatAbsoluteVolume(volumeMode: VolumeMode, absoluteVolume: number, unitPreference: UnitPreference) {
  if (volumeMode === "time") {
    return formatDurationSeconds(absoluteVolume);
  }

  return formatDistanceForDisplay(absoluteVolume, unitPreference);
}

function normalizeDate(date: Date | null): number | null {
  if (!date) {
    return null;
  }

  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized.getTime();
}

function formatTargetDate(date: Date | null): string | null {
  if (!date) {
    return null;
  }

  return date.toLocaleDateString();
}

function dateFromWeeksAhead(weeks: number) {
  const date = new Date();
  date.setDate(date.getDate() + weeks * 7);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatWeekdayLabel(day: (typeof WEEKDAYS)[number]) {
  return WEEKDAY_LABELS[day];
}

function formatInterruptionLabel(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function splitGoalTimeFields(seconds?: number | null) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) {
    return {
      hours: "",
      minutes: "",
      seconds: "",
    };
  }

  const rounded = Math.max(0, Math.round(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainder = rounded % 60;

  return {
    hours: hours > 0 ? String(hours) : "",
    minutes: String(minutes),
    seconds: String(remainder),
  };
}

function parseGoalTimeText(hoursText: string, minutesText: string, secondsText: string): number | null {
  const hours = Number(hoursText.trim() || "0");
  const minutes = Number(minutesText.trim() || "0");
  const seconds = Number(secondsText.trim() || "0");

  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    !Number.isFinite(seconds) ||
    hours < 0 ||
    minutes < 0 ||
    seconds < 0 ||
    minutes >= 60 ||
    seconds >= 60
  ) {
    return null;
  }

  const total = Math.round(hours) * 3600 + Math.round(minutes) * 60 + Math.round(seconds);
  return total > 0 ? total : null;
}

function WeekStructure({
  numberOfWeeks,
  weeklyVolumeProfile,
  weeklyEmphasis,
}: {
  numberOfWeeks: number;
  weeklyVolumeProfile?: Array<{ weekNumber: number; percentOfPeak: number }>;
  weeklyEmphasis?: Array<{ weekNumber: number; emphasis: string }>;
}) {
  const percentByWeek = new Map((weeklyVolumeProfile ?? []).map((entry) => [entry.weekNumber, entry.percentOfPeak]));
  const emphasisByWeek = new Map((weeklyEmphasis ?? []).map((entry) => [entry.weekNumber, entry.emphasis]));

  return (
    <View style={styles.weekStructureList}>
      {Array.from({ length: numberOfWeeks }, (_, index) => index + 1).map((weekNumber) => (
        <View key={weekNumber} style={styles.weekStructureRow}>
          <Text style={styles.weekStructureWeek}>W{weekNumber}</Text>
          <Text style={styles.weekStructurePercent}>
            {percentByWeek.has(weekNumber) ? `${Math.round((percentByWeek.get(weekNumber) ?? 0) * 100)}%` : "--"}
          </Text>
          <Text style={styles.weekStructureEmphasis}>{emphasisByWeek.get(weekNumber) ?? "-"}</Text>
        </View>
      ))}
    </View>
  );
}

export function PlanScreen({
  defaultVolumeMode,
  unitPreference,
  route,
  onRouteChange,
}: {
  defaultVolumeMode: VolumeMode;
  unitPreference: UnitPreference;
  route: PlanRoute;
  onRouteChange: (route: PlanRoute) => void;
}) {
  const [nowBucketMs, setNowBucketMs] = useState(getPlanTimeBucketMs);
  const planOverview = useQuery(api.planOverview.getPlanOverviewView, { nowBucketMs });
  const weekAgenda = useQuery(
    api.weekDetail.getWeekDetailView,
    planOverview?.activePlan && route.screen === "week"
      ? {
          planId: planOverview.activePlan._id,
          weekNumber: route.weekNumber,
          nowBucketMs,
        }
      : "skip",
  );
  const planBuilderView = useQuery(api.planning.getPlanBuilderView, {});
  const weekBuilderView = useQuery(
    api.planning.getWeekBuilderView,
    planOverview?.activePlan && route.screen === "week"
      ? {
          planId: planOverview.activePlan._id,
          weekNumber: route.weekNumber,
        }
      : "skip",
  );
  const workoutDetail = useQuery(
    api.workoutDetail.getWorkoutDetailView,
    route.screen === "workout"
      ? {
          workoutId: route.workoutId,
        }
      : "skip",
  );
  const pastPlanDetail = useQuery(
    api.planAssessments.getPastPlanDetailView,
    route.screen === "pastPlan"
      ? {
          planId: route.planId,
        }
      : "skip",
  );

  const startPlanBuilderSession = useMutation(api.planning.startPlanBuilderSession);
  const sendPlanBuilderMessage = useMutation(api.planning.sendPlanBuilderMessage);
  const materializePlanDraft = useMutation(api.planning.materializePlanDraft);
  const retryPlanAssessment = useMutation(api.coach.retryPlanAssessment);
  const activateDraftPlan = useMutation(api.plans.activateDraftPlan);
  const updateDraftPlanBasics = useMutation(api.plans.updateDraftPlanBasics);
  const updatePlanStatus = useMutation(api.plans.updatePlanStatus);
  const updatePlanPeakVolume = useMutation(api.planOverview.updatePlanPeakVolume);
  const changePlanGoal = useMutation(api.planOverview.changePlanGoal);
  const reportPlanInterruption = useMutation(api.planOverview.reportPlanInterruption);
  const startWeekBuilderSession = useMutation(api.planning.startWeekBuilderSession);
  const sendWeekBuilderMessage = useMutation(api.planning.sendWeekBuilderMessage);
  const applyWeekDraft = useMutation(api.planning.applyWeekDraft);
  const skipWorkout = useMutation(api.workoutDetail.skipWorkout);
  const rescheduleWorkout = useMutation(api.workoutDetail.rescheduleWorkout);
  const saveWeekAvailabilityOverride = useMutation(api.weekDetail.saveWeekAvailabilityOverride);
  const clearWeekAvailabilityOverride = useMutation(api.weekDetail.clearWeekAvailabilityOverride);
  const toggleStrengthWorkout = useMutation(api.workoutDetail.toggleStrengthWorkout);

  const [createStep, setCreateStep] = useState(0);
  const [goalType, setGoalType] = useState<PlanGoalType>("race");
  const [goalPreset, setGoalPreset] = useState<string>("5K");
  const [customGoalLabel, setCustomGoalLabel] = useState("");
  const [targetDateValue, setTargetDateValue] = useState<Date | null>(() => dateFromWeeksAhead(12));
  const [goalTimeHours, setGoalTimeHours] = useState("0");
  const [goalTimeMinutes, setGoalTimeMinutes] = useState("0");
  const [goalTimeSecondsText, setGoalTimeSecondsText] = useState("0");
  const [numberOfWeeks, setNumberOfWeeks] = useState("10");
  const [volumeMode, setVolumeMode] = useState<VolumeMode>(defaultVolumeMode);
  const [raceDatePickerOpen, setRaceDatePickerOpen] = useState(false);
  const [proposalPeakOverride, setProposalPeakOverride] = useState("");
  const [planBuilderMessage, setPlanBuilderMessage] = useState("");
  const [draftPeakInputs, setDraftPeakInputs] = useState<Record<string, string>>({});
  const [planPeakOverride, setPlanPeakOverride] = useState("");
  const [goalEditType, setGoalEditType] = useState<PlanGoalType>("race");
  const [goalEditLabel, setGoalEditLabel] = useState("");
  const [goalEditDateValue, setGoalEditDateValue] = useState<Date | null>(null);
  const [goalEditDatePickerOpen, setGoalEditDatePickerOpen] = useState(false);
  const [goalEditHours, setGoalEditHours] = useState("");
  const [goalEditMinutes, setGoalEditMinutes] = useState("");
  const [goalEditSecondsText, setGoalEditSecondsText] = useState("");
  const [interruptionType, setInterruptionType] =
    useState<(typeof PLAN_INTERRUPTION_TYPES)[number]>("life");
  const [interruptionNote, setInterruptionNote] = useState("");
  const [selectedRescheduleDate, setSelectedRescheduleDate] = useState<string>("");
  const [overrideDays, setOverrideDays] = useState<Array<(typeof WEEKDAYS)[number]>>([]);
  const [overrideNote, setOverrideNote] = useState("");
  const [weekBuilderMessage, setWeekBuilderMessage] = useState("");
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setNowBucketMs(getPlanTimeBucketMs());
    }, 60 * 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  const activePlan = planOverview?.activePlan ?? null;
  const currentPlanWeek =
    activePlan?.currentWeekNumber && activePlan.trainingWeeks
      ? activePlan.trainingWeeks.find((week) => week.weekNumber === activePlan.currentWeekNumber) ?? null
      : null;
  const proposal = (planBuilderView?.draft?.latestObject as
    | {
        peakWeekVolume: number;
        numberOfWeeks: number;
        rationale: string;
        weeklyVolumeProfile: Array<{ weekNumber: number; percentOfPeak: number }>;
        weeklyEmphasis: Array<{ weekNumber: number; emphasis: string }>;
      }
    | null) ?? null;
  const selectedGoalLabel = goalPreset === "Custom" ? customGoalLabel.trim() : goalPreset;
  const targetDate = normalizeDate(targetDateValue);
  const formattedTargetDate = formatTargetDate(targetDateValue);
  const goalTimeSeconds = parseGoalTimeText(goalTimeHours, goalTimeMinutes, goalTimeSecondsText);
  const goalEditDate = normalizeDate(goalEditDateValue);
  const formattedGoalEditDate = formatTargetDate(goalEditDateValue);
  const goalEditTimeSeconds = parseGoalTimeText(
    goalEditHours,
    goalEditMinutes,
    goalEditSecondsText,
  );
  const createStepCount = 3;

  useEffect(() => {
    if (!proposal?.peakWeekVolume) {
      return;
    }

    setProposalPeakOverride(String(Math.round(proposal.peakWeekVolume)));
  }, [proposal?.peakWeekVolume]);

  useEffect(() => {
    if (route.screen !== "workout") {
      setSelectedRescheduleDate("");
      return;
    }

    if (!selectedRescheduleDate && workoutDetail?.rescheduleOptions[0]) {
      setSelectedRescheduleDate(workoutDetail.rescheduleOptions[0]);
    }
  }, [route.screen, selectedRescheduleDate, workoutDetail?.rescheduleOptions]);

  useEffect(() => {
    if (route.screen !== "week") {
      return;
    }

    setOverrideDays(
      (weekAgenda?.week.availabilityOverride?.preferredRunningDays ?? []) as Array<(typeof WEEKDAYS)[number]>,
    );
    setOverrideNote(weekAgenda?.week.availabilityOverride?.note ?? "");
  }, [route.screen, weekAgenda?.week._id, weekAgenda?.week.availabilityOverride]);

  useEffect(() => {
    if (!activePlan) {
      setPlanPeakOverride("");
      setGoalEditType("race");
      setGoalEditLabel("");
      setGoalEditDateValue(null);
      setGoalEditHours("");
      setGoalEditMinutes("");
      setGoalEditSecondsText("");
      setInterruptionType("life");
      setInterruptionNote("");
      return;
    }

    setPlanPeakOverride(String(activePlan.peakWeekVolume));
    setGoalEditType(activePlan.goalType === "race" ? "race" : "nonRace");
    setGoalEditLabel(activePlan.goalLabel ?? "");
    setGoalEditDateValue(activePlan.targetDate ? new Date(activePlan.targetDate) : null);
    const timeFields = splitGoalTimeFields(activePlan.goalTimeSeconds);
    setGoalEditHours(timeFields.hours);
    setGoalEditMinutes(timeFields.minutes);
    setGoalEditSecondsText(timeFields.seconds);
    setInterruptionType(
      (currentPlanWeek?.interruptionType as (typeof PLAN_INTERRUPTION_TYPES)[number] | null) ??
        "life",
    );
    setInterruptionNote(currentPlanWeek?.interruptionNote ?? "");
  }, [
    activePlan?._id,
    activePlan?.goalLabel,
    activePlan?.goalTimeSeconds,
    activePlan?.goalType,
    activePlan?.peakWeekVolume,
    activePlan?.targetDate,
    currentPlanWeek?.interruptionNote,
    currentPlanWeek?.interruptionType,
  ]);

  const currentGoalOptions = useMemo(
    () => (goalType === "race" ? [...RACE_GOALS] : [...NON_RACE_GOALS]),
    [goalType],
  );

  useEffect(() => {
    setGoalPreset(goalType === "race" ? "5K" : "Base Building");
    setCustomGoalLabel("");
    if (goalType !== "race") {
      setGoalTimeHours("0");
      setGoalTimeMinutes("0");
      setGoalTimeSecondsText("0");
    } else {
      setTargetDateValue((current) => current ?? dateFromWeeksAhead(12));
    }
  }, [goalType]);

  const runWithStatus = async (label: string, action: () => Promise<void>) => {
    setBusyLabel(label);
    setError(null);
    setMessage(null);
    try {
      await action();
    } catch (actionError) {
      setError(String(actionError));
    } finally {
      setBusyLabel(null);
    }
  };

  const canAdvanceCreateStep =
    createStep === 0
      ? selectedGoalLabel.length > 0
      : createStep === 1
        ? goalType !== "race" || targetDate !== null
        : true;

  const canSubmitCreate =
    selectedGoalLabel.length > 0 &&
    (goalType !== "race" || targetDate !== null) &&
    (goalType === "race" || (Number.isFinite(Number(numberOfWeeks)) && Number(numberOfWeeks) >= 4));

  const renderCreateFlow = () => (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader
        eyebrow="Plan"
        title="Create a plan"
        subtitle={`Step ${createStep + 1} of ${createStepCount}. Keep decisions structured, then ask the coach to build the draft.`}
        actionLabel="Back to overview"
        onAction={() => onRouteChange({ screen: "overview" })}
      />

      {error ? <StatusBanner tone="error" message={error} /> : null}
      {message ? <StatusBanner tone="success" message={message} /> : null}

      {createStep === 0 ? (
        <SectionCard title="Goal" description="Choose the goal type first, then pick a preset or define a custom target.">
          <FieldGroup label="Goal type">
            <ChoiceRow
              options={PLAN_GOAL_TYPES}
              selected={goalType}
              onChange={(value) => {
                setGoalType(value as PlanGoalType);
                setError(null);
              }}
            />
          </FieldGroup>
          <FieldGroup label="Goal selection">
            <ChoiceRow options={currentGoalOptions} selected={goalPreset} onChange={setGoalPreset} />
          </FieldGroup>
          {goalPreset === "Custom" ? (
            <FieldGroup
              label="Custom goal label"
              helperText={goalType === "race" ? "Examples: 15K, 50K, 100 miles" : "Examples: Run every day, return from injury"}
            >
              <TextInput
                style={styles.input}
                value={customGoalLabel}
                onChangeText={setCustomGoalLabel}
                placeholder="Describe the goal"
                placeholderTextColor="#7a848c"
              />
            </FieldGroup>
          ) : null}
        </SectionCard>
      ) : null}

      {createStep === 1 ? (
        <SectionCard title="Timeline" description="Race goals require a date. Goal time is optional and acts as a target check.">
          {goalType === "race" ? (
            <>
              <FieldGroup label="Target date" helperText="Pick a race date from the shared calendar, or tap a quick option to fill a likely race date.">
                <View style={styles.tagRow}>
                  {[8, 12, 16].map((weeks) => (
                    <SecondaryButton
                      key={weeks}
                      label={`${weeks} weeks`}
                      onPress={() => {
                        setTargetDateValue(dateFromWeeksAhead(weeks));
                      }}
                    />
                  ))}
                </View>
                <PickerField
                  value={formattedTargetDate}
                  placeholder="Select a race date"
                  onPress={() => {
                    setRaceDatePickerOpen(true);
                  }}
                />
                {formattedTargetDate ? <Text style={styles.helperText}>Target date preview: {formattedTargetDate}</Text> : null}
              </FieldGroup>
              <FieldGroup label="Goal time (optional)">
                <View style={styles.timeInputRow}>
                  <View style={styles.timeInputBlock}>
                    <Text style={styles.helperText}>Hours</Text>
                    <TextInput
                      style={styles.input}
                      value={goalTimeHours}
                      onChangeText={setGoalTimeHours}
                      keyboardType="number-pad"
                      placeholder="0"
                      placeholderTextColor="#7a848c"
                    />
                  </View>
                  <View style={styles.timeInputBlock}>
                    <Text style={styles.helperText}>Minutes</Text>
                    <TextInput
                      style={styles.input}
                      value={goalTimeMinutes}
                      onChangeText={setGoalTimeMinutes}
                      keyboardType="number-pad"
                      placeholder="45"
                      placeholderTextColor="#7a848c"
                    />
                  </View>
                  <View style={styles.timeInputBlock}>
                    <Text style={styles.helperText}>Seconds</Text>
                    <TextInput
                      style={styles.input}
                      value={goalTimeSecondsText}
                      onChangeText={setGoalTimeSecondsText}
                      keyboardType="number-pad"
                      placeholder="0"
                      placeholderTextColor="#7a848c"
                    />
                  </View>
                </View>
                {goalTimeSeconds ? <Text style={styles.helperText}>Goal time preview: {formatGoalTime(goalTimeSeconds)}</Text> : null}
              </FieldGroup>
            </>
          ) : (
            <FieldGroup label="Plan length (weeks)" helperText="Non-race goals keep the requested duration.">
              <TextInput
                style={styles.input}
                value={numberOfWeeks}
                onChangeText={setNumberOfWeeks}
                keyboardType="number-pad"
                placeholder="10"
                placeholderTextColor="#7a848c"
              />
            </FieldGroup>
          )}
        </SectionCard>
      ) : null}

      {createStep === 2 ? (
        <SectionCard title="Review" description="Use time or distance as the main planning unit, then send the request.">
          <FieldGroup label="Volume mode">
            <ChoiceRow
              options={VOLUME_MODES}
              selected={volumeMode}
              onChange={(value) => setVolumeMode(value as VolumeMode)}
            />
          </FieldGroup>
          <MetricGrid>
            <MetricStat label="Goal type" value={goalType} />
            <MetricStat label="Goal" value={selectedGoalLabel || "Custom goal"} />
            <MetricStat label="Volume" value={volumeMode} />
            <MetricStat label="Plan" value={goalType === "race" ? "Race build" : `${numberOfWeeks} weeks`} />
          </MetricGrid>
          {goalType === "race" ? <Text style={styles.helperText}>Target date: {formattedTargetDate ?? "Add a valid race date"}</Text> : null}
          {goalType === "race" && goalTimeSeconds ? <Text style={styles.helperText}>Goal time: {formatGoalTime(goalTimeSeconds)}</Text> : null}
          {goalType !== "race" ? <Text style={styles.helperText}>Requested weeks: {numberOfWeeks}</Text> : null}
        </SectionCard>
      ) : null}

      <StickyActionBar>
        {createStep > 0 ? <SecondaryButton label="Back" onPress={() => setCreateStep((step) => step - 1)} /> : null}
        {createStep < createStepCount - 1 ? (
          <PrimaryButton
            label="Continue"
            onPress={() => setCreateStep((step) => Math.min(createStepCount - 1, step + 1))}
            disabled={!canAdvanceCreateStep}
          />
        ) : (
          <PrimaryButton
            label={busyLabel === "request-plan" ? "Starting planning chat..." : "Start planning chat"}
            disabled={!canSubmitCreate || busyLabel !== null}
            onPress={() =>
              void runWithStatus("request-plan", async () => {
                await startPlanBuilderSession({
                  goalType,
                  goalLabel: selectedGoalLabel,
                  targetDate: targetDate ?? undefined,
                  goalTimeSeconds: goalType === "race" ? goalTimeSeconds ?? undefined : undefined,
                  volumeMode,
                  requestedNumberOfWeeks: goalType === "race" ? undefined : Number(numberOfWeeks),
                });
                setMessage("Planning conversation started. The live draft will appear in Proposal Review.");
                onRouteChange({ screen: "proposal" });
              })
            }
          />
        )}
      </StickyActionBar>

      <CrossPlatformPickerSheet
        visible={raceDatePickerOpen}
        title="Target race date"
        mode="date"
        value={targetDateValue ?? dateFromWeeksAhead(12)}
        minimumDate={new Date()}
        onCancel={() => {
          setRaceDatePickerOpen(false);
        }}
        onConfirm={(nextDate) => {
          const normalized = new Date(nextDate);
          normalized.setHours(0, 0, 0, 0);
          setTargetDateValue(normalized);
          setRaceDatePickerOpen(false);
        }}
      />
    </ScrollView>
  );

  const renderProposalView = () => (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader
        eyebrow="Plan"
        title="Planning thread"
        subtitle="Work with coach conversationally, then create a stored draft when the structure looks right."
        actionLabel="Overview"
        onAction={() => onRouteChange({ screen: "overview" })}
      />

      {error ? <StatusBanner tone="error" message={error} /> : null}
      {message ? <StatusBanner tone="success" message={message} /> : null}

      {!planBuilderView?.draft ? (
        <EmptyStateCard
          title="No planning thread yet"
          body="Start the guided create flow, then come back here once the coach opens a live draft."
          actionLabel="Create plan"
          onAction={() => onRouteChange({ screen: "create" })}
        />
      ) : (
        <>
          <SectionCard
            title="Live draft status"
            description={`Version ${planBuilderView.draft.version} · ${planBuilderView.draft.validationStatus}`}
          >
            {planBuilderView.draft.latestPreviewText ? (
              <Text style={styles.bodyText}>{planBuilderView.draft.latestPreviewText}</Text>
            ) : (
              <Text style={styles.bodyText}>Coach is still shaping the first draft.</Text>
            )}
            {planBuilderView.draft.latestError ? (
              <Text style={styles.errorText}>{planBuilderView.draft.latestError}</Text>
            ) : null}
          </SectionCard>

          {planBuilderView.messages.map((entry) => (
            <SectionCard
              key={entry._id}
              title={entry.author === "assistant" ? "Coach" : "You"}
              description={new Date(entry.createdAt).toLocaleString()}
            >
              <Text style={styles.bodyText}>{entry.body}</Text>
            </SectionCard>
          ))}

          {proposal ? (
            <SectionCard title="Current structured draft" description={proposal.rationale}>
              <MetricGrid>
                <MetricStat label="Peak week" value={`${Math.round(proposal.peakWeekVolume)} ${volumeMode === "time" ? "min" : "m"}`} />
                <MetricStat label="Weeks" value={String(proposal.numberOfWeeks)} />
              </MetricGrid>
              <FieldGroup label="Peak week override" helperText="Adjust the ceiling before you create the draft.">
                <TextInput
                  style={styles.input}
                  value={proposalPeakOverride}
                  onChangeText={setProposalPeakOverride}
                  keyboardType="decimal-pad"
                  placeholder={String(Math.round(proposal.peakWeekVolume))}
                  placeholderTextColor="#7a848c"
                />
              </FieldGroup>
              <WeekStructure
                numberOfWeeks={proposal.numberOfWeeks}
                weeklyVolumeProfile={proposal.weeklyVolumeProfile}
                weeklyEmphasis={proposal.weeklyEmphasis}
              />
              <FieldGroup label="Ask coach for an adjustment">
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={planBuilderMessage}
                  onChangeText={setPlanBuilderMessage}
                  placeholder="Push the peak later, make the build safer, add more strength detail..."
                  placeholderTextColor="#7a848c"
                  multiline
                />
              </FieldGroup>
              <PrimaryButton
                label={busyLabel === "send-plan-adjustment" ? "Sending..." : "Send adjustment"}
                disabled={busyLabel !== null || !planBuilderMessage.trim()}
                onPress={() =>
                  void runWithStatus("send-plan-adjustment", async () => {
                    await sendPlanBuilderMessage({
                      draftId: planBuilderView.draft!._id as Id<"agentPlanDrafts">,
                      body: planBuilderMessage,
                    });
                    setPlanBuilderMessage("");
                    setMessage("Coach is revising the draft.");
                  })
                }
              />
              <PrimaryButton
                label={busyLabel === "create-draft" ? "Starting plan..." : "Start this plan"}
                disabled={
                  busyLabel !== null ||
                  planBuilderView.draft.consumedByPlanId !== null ||
                  planBuilderView.draft.validationStatus !== "valid"
                }
                onPress={() =>
                  void runWithStatus("create-draft", async () => {
                    await materializePlanDraft({
                      draftId: planBuilderView.draft!._id as Id<"agentPlanDrafts">,
                      peakWeekVolumeOverride:
                        proposalPeakOverride.trim().length > 0 && Number.isFinite(Number(proposalPeakOverride))
                          ? Number(proposalPeakOverride)
                          : undefined,
                      canonicalTimeZoneId: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
                    });
                    setMessage("Plan activated from the live draft.");
                    onRouteChange({ screen: "overview" });
                  })
                }
              />
            </SectionCard>
          ) : null}
        </>
      )}
    </ScrollView>
  );

  const renderOverview = () => (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader
        eyebrow="Plan"
        title={activePlan ? "Plan overview" : "Plan workspace"}
        subtitle="Create drafts, review the latest proposal, and open the current week without digging through one giant panel."
        actionLabel="Create"
        onAction={() => onRouteChange({ screen: "create" })}
      />

      {error ? <StatusBanner tone="error" message={error} /> : null}
      {message ? <StatusBanner tone="success" message={message} /> : null}

      {planOverview === undefined ? <StatusBanner message="Loading plan state..." /> : null}

      {!activePlan ? (
        <EmptyStateCard
          title="No active plan"
          body="Generate a proposal, create a draft, and activate it when the structure looks right."
          actionLabel="Start create flow"
          onAction={() => onRouteChange({ screen: "create" })}
        />
      ) : (
        <SectionCard title={activePlan.goalLabel} description={`${activePlan.numberOfWeeks} weeks · peak ${Math.round(activePlan.peakWeekVolume)} ${activePlan.volumeMode === "time" ? "min" : "m"}`}>
          <MetricGrid>
            <MetricStat label="Current week" value={activePlan.currentWeekNumber ? String(activePlan.currentWeekNumber) : "-"} />
            <MetricStat label="Next week" value={activePlan.nextWeekNumber ? String(activePlan.nextWeekNumber) : "-"} />
          </MetricGrid>
          <View style={styles.weekList}>
            {activePlan.trainingWeeks.map((week) => (
              <Pressable key={String(week._id)} style={styles.weekListRow} onPress={() => onRouteChange({ screen: "week", weekNumber: week.weekNumber })}>
                <View style={styles.weekListHeader}>
                  <Text style={styles.weekListTitle}>Week {week.weekNumber}</Text>
                  {week.weekNumber === activePlan.currentWeekNumber ? <Text style={styles.weekBadge}>Current</Text> : null}
                </View>
                <Text style={styles.helperText}>
                  {Math.round(week.targetVolumePercent * 100)}% of peak · {week.emphasis || "No emphasis"}
                </Text>
                <Text style={styles.helperText}>
                  {formatDateKeyForDisplay(week.weekStartDateKey)} - {formatDateKeyForDisplay(week.weekEndDateKey)} ·{" "}
                  {week.generated ? "Generated" : "Outline only"}
                </Text>
              </Pressable>
            ))}
          </View>
        </SectionCard>
      )}

      {activePlan ? (
        <SectionCard
          title="Adjust this plan"
          description={
            activePlan.status === "draft"
              ? "Refine the draft before activation."
              : "Keep the current block aligned when volume targets or goals change."
          }
        >
          <FieldGroup
            label="Peak week volume"
            helperText={activePlan.volumeMode === "time" ? "Minutes" : "Meters"}
          >
            <TextInput
              style={styles.input}
              value={planPeakOverride}
              onChangeText={setPlanPeakOverride}
              keyboardType="decimal-pad"
              placeholder={String(Math.round(activePlan.peakWeekVolume))}
              placeholderTextColor="#7a848c"
            />
          </FieldGroup>
          <PrimaryButton
            label={
              busyLabel === "save-plan-peak"
                ? "Saving..."
                : activePlan.status === "draft"
                  ? "Save draft peak"
                  : "Save peak volume"
            }
            disabled={busyLabel !== null}
            onPress={() =>
              void runWithStatus("save-plan-peak", async () => {
                const normalizedValue = planPeakOverride.trim();
                const peakWeekVolume = Number(normalizedValue);
                if (!normalizedValue || !Number.isFinite(peakWeekVolume) || peakWeekVolume <= 0) {
                  throw new Error("Peak week volume must be a positive number.");
                }
                if (activePlan.status === "draft") {
                  await updateDraftPlanBasics({ planId: activePlan._id, peakWeekVolume });
                  setMessage("Draft peak volume updated.");
                  return;
                }
                await updatePlanPeakVolume({
                  planId: activePlan._id,
                  peakWeekVolume,
                  reason: "Updated from mobile plan screen.",
                });
                setMessage("Peak volume saved.");
              })
            }
          />

          <FieldGroup label="Goal type">
            <ChoiceRow
              options={PLAN_GOAL_TYPES}
              selected={goalEditType}
              onChange={(value) => {
                const nextValue = value as PlanGoalType;
                setGoalEditType(nextValue);
                if (nextValue !== "race") {
                  setGoalEditHours("");
                  setGoalEditMinutes("");
                  setGoalEditSecondsText("");
                }
              }}
            />
          </FieldGroup>
          <FieldGroup label="Goal label">
            <TextInput
              style={styles.input}
              value={goalEditLabel}
              onChangeText={setGoalEditLabel}
              placeholder="Describe the goal"
              placeholderTextColor="#7a848c"
            />
          </FieldGroup>
          <FieldGroup
            label="Target date"
            helperText={
              goalEditType === "race"
                ? "Required for race goals."
                : "Optional block end date for non-race goals."
            }
          >
            <PickerField
              value={formattedGoalEditDate}
              placeholder={
                goalEditType === "race" ? "Select target date" : "Optional end date"
              }
              onPress={() => {
                setGoalEditDatePickerOpen(true);
              }}
            />
            {goalEditDateValue ? (
              <SecondaryButton
                label="Clear date"
                onPress={() => {
                  setGoalEditDateValue(null);
                }}
              />
            ) : null}
          </FieldGroup>
          {goalEditType === "race" ? (
            <FieldGroup label="Goal time (optional)">
              <View style={styles.timeInputRow}>
                <View style={styles.timeInputBlock}>
                  <Text style={styles.helperText}>Hours</Text>
                  <TextInput
                    style={styles.input}
                    value={goalEditHours}
                    onChangeText={setGoalEditHours}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor="#7a848c"
                  />
                </View>
                <View style={styles.timeInputBlock}>
                  <Text style={styles.helperText}>Minutes</Text>
                  <TextInput
                    style={styles.input}
                    value={goalEditMinutes}
                    onChangeText={setGoalEditMinutes}
                    keyboardType="number-pad"
                    placeholder="45"
                    placeholderTextColor="#7a848c"
                  />
                </View>
                <View style={styles.timeInputBlock}>
                  <Text style={styles.helperText}>Seconds</Text>
                  <TextInput
                    style={styles.input}
                    value={goalEditSecondsText}
                    onChangeText={setGoalEditSecondsText}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor="#7a848c"
                  />
                </View>
              </View>
              {goalEditTimeSeconds ? (
                <Text style={styles.helperText}>
                  Goal time preview: {formatGoalTime(goalEditTimeSeconds)}
                </Text>
              ) : null}
            </FieldGroup>
          ) : null}
          <PrimaryButton
            label={busyLabel === "save-goal-change" ? "Saving..." : "Save goal change"}
            disabled={busyLabel !== null}
            onPress={() =>
              void runWithStatus("save-goal-change", async () => {
                const goalLabel = goalEditLabel.trim();
                if (!goalLabel) {
                  throw new Error("Goal label is required.");
                }
                if (goalEditType === "race" && goalEditDate === null) {
                  throw new Error("Race goals need a target date.");
                }
                await changePlanGoal({
                  planId: activePlan._id,
                  goalType: goalEditType,
                  goalLabel,
                  targetDate: goalEditDate ?? undefined,
                  goalTimeSeconds:
                    goalEditType === "race" ? goalEditTimeSeconds ?? undefined : undefined,
                  reason: "Updated from mobile plan screen.",
                });
                setMessage("Goal change recorded.");
              })
            }
          />
        </SectionCard>
      ) : null}

      {activePlan?.status === "active" ? (
        <SectionCard
          title="Pause this week"
          description={
            activePlan.currentWeekNumber
              ? `Applies to week ${activePlan.currentWeekNumber}.`
              : "Current week not available yet."
          }
        >
          {currentPlanWeek?.interruptionType ? (
            <Text style={styles.helperText}>
              Current note: {formatInterruptionLabel(currentPlanWeek.interruptionType)}
              {currentPlanWeek.interruptionNote ? ` - ${currentPlanWeek.interruptionNote}` : ""}
            </Text>
          ) : null}
          <FieldGroup label="Reason">
            <ChoiceRow
              options={PLAN_INTERRUPTION_TYPES}
              selected={interruptionType}
              onChange={(value) =>
                setInterruptionType(value as (typeof PLAN_INTERRUPTION_TYPES)[number])
              }
            />
          </FieldGroup>
          <FieldGroup label="Note">
            <TextInput
              style={[styles.input, styles.textArea]}
              value={interruptionNote}
              onChangeText={setInterruptionNote}
              placeholder="Travel, fatigue, illness, or schedule change..."
              placeholderTextColor="#7a848c"
              multiline
            />
          </FieldGroup>
          <PrimaryButton
            label={busyLabel === "save-interruption" ? "Saving..." : "Save pause note"}
            disabled={busyLabel !== null || activePlan.currentWeekNumber === null}
            onPress={() =>
              void runWithStatus("save-interruption", async () => {
                await reportPlanInterruption({
                  planId: activePlan._id,
                  type: interruptionType,
                  note: interruptionNote.trim() || "Marked from mobile plan screen.",
                });
                setMessage("Interruption recorded.");
              })
            }
          />
        </SectionCard>
      ) : null}

      <SectionCard title="Planning thread" description="The live conversational draft, if one exists.">
        {planBuilderView?.draft ? (
          <>
            <Text style={styles.bodyText}>Status: {planBuilderView.draft.validationStatus}</Text>
            <SecondaryButton label="Open planning thread" onPress={() => onRouteChange({ screen: "proposal" })} />
          </>
        ) : (
          <Text style={styles.bodyText}>No live planning thread yet.</Text>
        )}
      </SectionCard>

      <SectionCard title="Legacy saved drafts" description="Older saved drafts still work, but the live draft is now the primary path.">
        {planOverview?.draftPlans.length ? (
          planOverview.draftPlans.map((draft) => (
            <View key={String(draft._id)} style={styles.subtleBlock}>
              <Text style={styles.sectionCardTitle}>{draft.goalLabel ?? draft.goal?.label ?? "Draft plan"}</Text>
              <Text style={styles.helperText}>
                {draft.numberOfWeeks} weeks · peak {Math.round(draft.peakWeekVolume)} {draft.volumeMode === "time" ? "min" : "m"}
              </Text>
              <FieldGroup label="Peak week override">
                <TextInput
                  style={styles.input}
                  value={draftPeakInputs[String(draft._id)] ?? ""}
                  onChangeText={(value) =>
                    setDraftPeakInputs((current) => ({
                      ...current,
                      [String(draft._id)]: value,
                    }))
                  }
                  keyboardType="decimal-pad"
                  placeholder={String(Math.round(draft.peakWeekVolume))}
                  placeholderTextColor="#7a848c"
                />
              </FieldGroup>
              <SecondaryButton
                label={busyLabel === `save-draft-${String(draft._id)}` ? "Saving..." : "Save draft peak"}
                disabled={busyLabel !== null}
                onPress={() =>
                  void runWithStatus(`save-draft-${String(draft._id)}`, async () => {
                    const raw = draftPeakInputs[String(draft._id)]?.trim() ?? "";
                    const peakWeekVolume = Number(raw);
                    if (!raw || !Number.isFinite(peakWeekVolume) || peakWeekVolume <= 0) {
                      throw new Error("Draft peak volume must be a positive number.");
                    }
                    await updateDraftPlanBasics({ planId: draft._id, peakWeekVolume });
                    setMessage("Draft peak volume updated.");
                  })
                }
              />
              <PrimaryButton
                label={busyLabel === `activate-draft-${String(draft._id)}` ? "Activating..." : "Activate draft"}
                disabled={busyLabel !== null || Boolean(activePlan)}
                onPress={() =>
                  void runWithStatus(`activate-draft-${String(draft._id)}`, async () => {
                    await activateDraftPlan({
                      planId: draft._id,
                      canonicalTimeZoneId: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
                    });
                    setMessage("Draft activated.");
                  })
                }
              />
            </View>
          ))
        ) : (
          <Text style={styles.bodyText}>No drafts yet.</Text>
        )}
      </SectionCard>

      <SectionCard title="Past plans" description="Completed and abandoned blocks stay read-only, with the assessment attached.">
        {planOverview?.pastPlans.length ? (
          planOverview.pastPlans.map((plan) => (
            <View key={String(plan._id)} style={styles.subtleBlock}>
              <Text style={styles.sectionCardTitle}>{plan.goalLabel ?? "Past plan"}</Text>
              <Text style={styles.helperText}>
                {plan.status} · {plan.numberOfWeeks} weeks · peak {Math.round(plan.peakWeekVolume)} {plan.volumeMode === "time" ? "min" : "m"}
              </Text>
              <PlanAssessmentSummary state={plan.assessment} />
              <SecondaryButton
                label="Open block detail"
                onPress={() => onRouteChange({ screen: "pastPlan", planId: plan._id })}
              />
            </View>
          ))
        ) : (
          <Text style={styles.bodyText}>No completed or abandoned plans yet.</Text>
        )}
      </SectionCard>

      {activePlan ? (
        <SectionCard title="Plan controls" description="Keep destructive actions out of the main browsing flow.">
          <SecondaryButton
            label={busyLabel === "complete-plan" ? "Completing..." : "Mark plan complete"}
            disabled={busyLabel !== null}
            onPress={() =>
              void runWithStatus("complete-plan", async () => {
                await updatePlanStatus({ planId: activePlan._id, status: "completed" });
                setMessage("Plan marked complete.");
              })
            }
          />
          <SecondaryButton
            label={busyLabel === "abandon-plan" ? "Closing..." : "Abandon active plan"}
            disabled={busyLabel !== null}
            onPress={() =>
              void runWithStatus("abandon-plan", async () => {
                await updatePlanStatus({ planId: activePlan._id, status: "abandoned" });
                setMessage("Plan abandoned.");
              })
            }
          />
        </SectionCard>
      ) : null}

      <CrossPlatformPickerSheet
        visible={goalEditDatePickerOpen}
        title="Goal target date"
        mode="date"
        value={goalEditDateValue ?? new Date()}
        minimumDate={new Date()}
        onCancel={() => {
          setGoalEditDatePickerOpen(false);
        }}
        onConfirm={(nextDate) => {
          const normalized = new Date(nextDate);
          normalized.setHours(0, 0, 0, 0);
          setGoalEditDateValue(normalized);
          setGoalEditDatePickerOpen(false);
        }}
      />
    </ScrollView>
  );

  const renderPastPlanView = () => (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader
        eyebrow="Plan history"
        title={pastPlanDetail ? pastPlanDetail.plan.goalLabel : "Past plan"}
        subtitle={pastPlanDetail ? `${pastPlanDetail.plan.status} · ${pastPlanDetail.plan.numberOfWeeks} weeks` : "Loading block..."}
        actionLabel="Overview"
        onAction={() => onRouteChange({ screen: "overview" })}
      />

      {error ? <StatusBanner tone="error" message={error} /> : null}
      {message ? <StatusBanner tone="success" message={message} /> : null}
      {pastPlanDetail === undefined ? <StatusBanner message="Loading plan history..." /> : null}

      {pastPlanDetail ? (
        <>
          <SectionCard
            title="Assessment"
            description={`Peak ${Math.round(pastPlanDetail.plan.peakWeekVolume)} ${pastPlanDetail.plan.volumeMode === "time" ? "min" : "m"}`}
          >
            <PlanAssessmentSummary
              state={pastPlanDetail.assessment}
              retrying={busyLabel === "retry-assessment"}
              onRetry={(requestId) => {
                void runWithStatus("retry-assessment", async () => {
                  await retryPlanAssessment({ requestId: requestId as Id<"aiRequests"> });
                  setMessage("Assessment retry queued.");
                });
              }}
            />
          </SectionCard>

          <SectionCard title="Week structure" description="Read-only history of the block structure.">
            <View style={styles.weekList}>
              {pastPlanDetail.weeks.map((week) => (
                <View key={String(week._id)} style={styles.weekListRow}>
                  <View style={styles.weekListHeader}>
                    <Text style={styles.weekListTitle}>Week {week.weekNumber}</Text>
                  </View>
                  <Text style={styles.helperText}>
                    {Math.round(week.targetVolumePercent * 100)}% of peak · {week.emphasis || "No emphasis"}
                  </Text>
                  <Text style={styles.helperText}>
                    {formatDateKeyForDisplay(week.weekStartDateKey)} - {formatDateKeyForDisplay(week.weekEndDateKey)}
                    {week.interruptionType ? ` · ${formatInterruptionLabel(week.interruptionType)}` : ""}
                  </Text>
                  {week.coachNotes ? <Text style={styles.bodyText}>{week.coachNotes}</Text> : null}
                </View>
              ))}
            </View>
          </SectionCard>
        </>
      ) : null}
    </ScrollView>
  );

  const renderWeekAgenda = () => (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader
        eyebrow="Plan"
        title={weekAgenda ? `Week ${weekAgenda.week.weekNumber}` : "Week agenda"}
        subtitle={
          weekAgenda
            ? `${formatDateKeyForDisplay(weekAgenda.week.weekStartDateKey)} - ${formatDateKeyForDisplay(weekAgenda.week.weekEndDateKey)}`
            : "Loading week..."
        }
        actionLabel="Overview"
        onAction={() => onRouteChange({ screen: "overview" })}
      />

      {error ? <StatusBanner tone="error" message={error} /> : null}
      {message ? <StatusBanner tone="success" message={message} /> : null}
      {weekAgenda === undefined ? <StatusBanner message="Loading week agenda..." /> : null}

      {weekAgenda ? (
        <>
          <SectionCard title="Week summary" description={weekAgenda.week.emphasis || "No emphasis"}>
            <MetricGrid>
              <MetricStat
                label="Target"
                value={formatAbsoluteVolume(weekAgenda.plan.volumeMode, weekAgenda.week.targetVolumeAbsolute, unitPreference)}
                hint={`${Math.round(weekAgenda.week.targetVolumePercent * 100)}% of peak`}
              />
              <MetricStat label="Status" value={weekAgenda.week.generated ? "Generated" : "Outline only"} />
            </MetricGrid>
            {weekAgenda.week.coachNotes ? <Text style={styles.bodyText}>{weekAgenda.week.coachNotes}</Text> : null}
            {weekAgenda.week.interruptionType ? (
              <Text style={styles.helperText}>
                Current interruption: {formatInterruptionLabel(weekAgenda.week.interruptionType)}
                {weekAgenda.week.interruptionNote ? ` - ${weekAgenda.week.interruptionNote}` : ""}
              </Text>
            ) : null}
            <PrimaryButton
              label={busyLabel === "start-week-builder" ? "Opening..." : "Open week builder"}
              disabled={busyLabel !== null || !activePlan}
              onPress={() =>
                void runWithStatus("start-week-builder", async () => {
                  await startWeekBuilderSession({
                    planId: activePlan!._id,
                    weekNumber: weekAgenda.week.weekNumber,
                    note: overrideNote.trim() || undefined,
                  });
                  setMessage(`Week ${weekAgenda.week.weekNumber} builder ready.`);
                })
              }
            />
          </SectionCard>

          <SectionCard title="Week builder" description="Generate and revise this week conversationally before you apply it.">
            {weekBuilderView?.draft?.latestPreviewText ? (
              <Text style={styles.bodyText}>{weekBuilderView.draft.latestPreviewText}</Text>
            ) : (
              <Text style={styles.bodyText}>Open the week builder to create a live draft for this week.</Text>
            )}
            {weekBuilderView?.messages?.map((entry) => (
              <View key={entry._id} style={styles.subtleBlock}>
                <Text style={styles.sectionCardTitle}>{entry.author === "assistant" ? "Coach" : "You"}</Text>
                <Text style={styles.bodyText}>{entry.body}</Text>
              </View>
            ))}
            <FieldGroup label="Ask coach for a change">
              <TextInput
                style={[styles.input, styles.textArea]}
                value={weekBuilderMessage}
                onChangeText={setWeekBuilderMessage}
                placeholder="Move the long run, account for travel, reduce intensity..."
                placeholderTextColor="#7a848c"
                multiline
              />
            </FieldGroup>
            <PrimaryButton
              label={busyLabel === "send-week-adjustment" ? "Sending..." : "Send adjustment"}
              disabled={busyLabel !== null || !weekBuilderView?.draft || !weekBuilderMessage.trim()}
              onPress={() =>
                void runWithStatus("send-week-adjustment", async () => {
                  const draft = weekBuilderView?.draft;
                  if (!draft) {
                    return;
                  }
                  await sendWeekBuilderMessage({
                    weekDraftId: draft._id as Id<"agentWeekDrafts">,
                    body: weekBuilderMessage,
                  });
                  setWeekBuilderMessage("");
                  setMessage(`Coach is revising week ${weekAgenda.week.weekNumber}.`);
                })
              }
            />
            <PrimaryButton
              label={busyLabel === "apply-week-draft" ? "Applying..." : "Apply week draft"}
              disabled={
                busyLabel !== null ||
                !weekBuilderView?.draft ||
                weekBuilderView.draft.validationStatus !== "valid"
              }
              onPress={() =>
                void runWithStatus("apply-week-draft", async () => {
                  const draft = weekBuilderView?.draft;
                  if (!draft) {
                    return;
                  }
                  await applyWeekDraft({
                    weekDraftId: draft._id as Id<"agentWeekDrafts">,
                  });
                  setMessage(`Week ${weekAgenda.week.weekNumber} applied.`);
                })
              }
            />
            {weekBuilderView?.draft?.latestError ? (
              <Text style={styles.errorText}>{weekBuilderView.draft.latestError}</Text>
            ) : null}
          </SectionCard>

          <SectionCard title="Week adjustments" description="Override available days or add a note for this week only.">
            {weekAgenda.week.availabilityOverride?.availabilityWindows ? (
              <Text style={styles.helperText}>Existing override time windows are preserved when you save from mobile.</Text>
            ) : null}
            <FieldGroup label="Available days">
              <TagGrid
                options={WEEKDAYS}
                selected={overrideDays}
                onToggle={(value) => {
                  const day = value as (typeof WEEKDAYS)[number];
                  setOverrideDays((current) =>
                    current.includes(day) ? current.filter((entry) => entry !== day) : [...current, day],
                  );
                }}
              />
            </FieldGroup>
            <Text style={styles.helperText}>
              Selected: {overrideDays.length ? overrideDays.map(formatWeekdayLabel).join(", ") : "No day override"}
            </Text>
            <FieldGroup label="Week note">
              <TextInput
                style={[styles.input, styles.textArea]}
                value={overrideNote}
                onChangeText={setOverrideNote}
                placeholder="Travel, work trip, family schedule..."
                placeholderTextColor="#7a848c"
                multiline
              />
            </FieldGroup>
            <PrimaryButton
              label={busyLabel === "save-override" ? "Saving..." : "Save override"}
              disabled={busyLabel !== null}
              onPress={() =>
                void runWithStatus("save-override", async () => {
                  await saveWeekAvailabilityOverride({
                    weekId: weekAgenda.week._id,
                    preferredRunningDays: overrideDays.length ? overrideDays : undefined,
                    availabilityWindows: weekAgenda.week.availabilityOverride?.availabilityWindows ?? undefined,
                    note: overrideNote.trim() || undefined,
                  });
                  setMessage(`Week ${weekAgenda.week.weekNumber} override saved.`);
                })
              }
            />
            <SecondaryButton
              label={busyLabel === "clear-override" ? "Clearing..." : "Clear override"}
              disabled={busyLabel !== null}
              onPress={() =>
                void runWithStatus("clear-override", async () => {
                  await clearWeekAvailabilityOverride({
                    weekId: weekAgenda.week._id,
                  });
                  setOverrideDays([]);
                  setOverrideNote("");
                  setMessage(`Week ${weekAgenda.week.weekNumber} override cleared.`);
                })
              }
            />
          </SectionCard>

          {weekAgenda.days.map((day) => (
            <SectionCard
              key={day.dateKey}
              title={formatDateKeyForDisplay(day.dateKey)}
              description={`${day.workouts.length} workout${day.workouts.length === 1 ? "" : "s"}`}
            >
              {day.workouts.map((workout) => (
                <View key={String(workout._id)} style={styles.subtleBlock}>
                  <View style={styles.statusRow}>
                    <Text style={styles.sectionCardTitle}>{formatWorkoutTypeLabel(workout.type)}</Text>
                    <Text style={[styles.statusBadge, workout.status === "completed" ? styles.statusBadgeMatched : workout.status === "modified" ? styles.statusBadgeNeedsReview : styles.statusBadgeUnmatched]}>
                      {workout.status}
                    </Text>
                  </View>
                  <Text style={styles.helperText}>
                    {formatAbsoluteVolume(weekAgenda.plan.volumeMode, workout.absoluteVolume, unitPreference)} · {workout.venue}
                  </Text>
                  <PrimaryButton
                    label="Open workout"
                    onPress={() => onRouteChange({ screen: "workout", weekNumber: weekAgenda.week.weekNumber, workoutId: workout._id })}
                  />
                </View>
              ))}
            </SectionCard>
          ))}

          <SectionCard title="Strength and races" description="Separate from running workouts, but still part of this week's context.">
            {weekAgenda.strengthWorkouts.length ? (
              weekAgenda.strengthWorkouts.map((workout) => (
                <View key={String(workout._id)} style={styles.subtleBlock}>
                  <View style={styles.statusRow}>
                    <Text style={styles.sectionCardTitle}>{workout.title}</Text>
                    <Text
                      style={[
                        styles.statusBadge,
                        workout.status === "completed" ? styles.statusBadgeMatched : styles.statusBadgeUnmatched,
                      ]}
                    >
                      {workout.status}
                    </Text>
                  </View>
                  <Text style={styles.helperText}>{workout.plannedMinutes} min</Text>
                  {workout.notes ? <Text style={styles.bodyText}>{workout.notes}</Text> : null}
                  {workout.exercises.map((exercise, index) => (
                    <Text key={`${String(workout._id)}-${index}`} style={styles.helperText}>
                      {exercise.name} · {exercise.sets} sets
                      {typeof exercise.reps === "number" ? ` · ${exercise.reps} reps` : ""}
                      {typeof exercise.holdSeconds === "number" ? ` · ${exercise.holdSeconds}s hold` : ""}
                    </Text>
                  ))}
                  <SecondaryButton
                    label={
                      busyLabel === `strength-${String(workout._id)}`
                        ? "Saving..."
                        : workout.status === "completed"
                          ? "Mark planned"
                          : "Mark done"
                    }
                    disabled={busyLabel !== null}
                    onPress={() =>
                      void runWithStatus(`strength-${String(workout._id)}`, async () => {
                        await toggleStrengthWorkout({
                          strengthWorkoutId: workout._id,
                          completed: workout.status !== "completed",
                        });
                        setMessage(`Updated ${workout.title}.`);
                      })
                    }
                  />
                </View>
              ))
            ) : (
              <Text style={styles.bodyText}>No strength sessions are attached to this week.</Text>
            )}

            {weekAgenda.races.length ? (
              weekAgenda.races.map((race) => (
                <View key={String(race._id)} style={styles.subtleBlock}>
                  <View style={styles.statusRow}>
                    <Text style={styles.sectionCardTitle}>{race.label}</Text>
                    <Text style={[styles.statusBadge, styles.statusBadgeNeedsReview]}>
                      {race.isPrimaryGoal ? "Primary goal" : race.actualTimeSeconds ? "Completed" : "Tune-up race"}
                    </Text>
                  </View>
                  <Text style={styles.helperText}>
                    {new Date(race.plannedDate).toLocaleDateString()} · {formatDistanceForDisplay(race.distanceMeters, unitPreference)}
                  </Text>
                  {typeof race.goalTimeSeconds === "number" ? (
                    <Text style={styles.helperText}>Goal time: {formatGoalTime(race.goalTimeSeconds)}</Text>
                  ) : null}
                </View>
              ))
            ) : (
              <Text style={styles.bodyText}>No races fall inside this week.</Text>
            )}
          </SectionCard>
        </>
      ) : null}
    </ScrollView>
  );

  const renderWorkoutView = () => (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader
        eyebrow="Plan"
        title={workoutDetail ? `${formatWorkoutTypeLabel(workoutDetail.workout.type)}` : "Workout detail"}
        subtitle={
          workoutDetail
            ? `${formatDateKeyForDisplay(workoutDetail.workout.scheduledDateKey)} · Week ${workoutDetail.week.weekNumber}`
            : "Loading workout..."
        }
        actionLabel={route.screen === "workout" ? `Week ${route.weekNumber}` : "Back"}
        onAction={() => onRouteChange({ screen: "week", weekNumber: route.screen === "workout" ? route.weekNumber : 1 })}
      />

      {error ? <StatusBanner tone="error" message={error} /> : null}
      {message ? <StatusBanner tone="success" message={message} /> : null}
      {workoutDetail === undefined ? <StatusBanner message="Loading workout detail..." /> : null}

      {workoutDetail ? (
        <>
          <SectionCard title="Workout summary" description={`${workoutDetail.plan.goalLabel} · ${workoutDetail.plan.volumeMode} mode`}>
            <MetricGrid>
              <MetricStat
                label="Target"
                value={formatAbsoluteVolume(workoutDetail.plan.volumeMode, workoutDetail.workout.absoluteVolume, unitPreference)}
                hint={`${Math.round(workoutDetail.workout.volumePercent * 100)}% of peak`}
              />
              <MetricStat label="Venue" value={workoutDetail.workout.venue} />
            </MetricGrid>
            {workoutDetail.workout.notes ? <Text style={styles.bodyText}>{workoutDetail.workout.notes}</Text> : null}
          </SectionCard>

          <SectionCard title="Segments" description="Ordered from summary down into pace-zone detail.">
            {workoutDetail.workout.segments.length > 0 ? (
              workoutDetail.workout.segments.map((segment, index) => (
                <Text key={`${String(workoutDetail.workout._id)}-${index}`} style={styles.helperText}>
                  {formatSegment(segment, unitPreference, workoutDetail.week.vdotAtGeneration)}
                </Text>
              ))
            ) : (
              <Text style={styles.bodyText}>No structured segments were attached to this workout.</Text>
            )}
          </SectionCard>

          {workoutDetail.executionDetail ? (
            <SectionCard title="Actual run summary" description="Check-in, matching, and advanced breakdown stay together here.">
              <WorkoutExecutionDetail executionId={workoutDetail.executionDetail.execution._id} unitPreference={unitPreference} />
            </SectionCard>
          ) : (
            <SectionCard title="Actual run summary" description="No imported workout is currently linked.">
              <Text style={styles.bodyText}>If the run was imported but not matched yet, review it from History and link it there.</Text>
            </SectionCard>
          )}

          <StickyActionBar>
            {workoutDetail.primaryAction === "checkIn" || workoutDetail.primaryAction === "viewActualRun" ? (
              <PrimaryButton label={workoutDetail.primaryAction === "checkIn" ? "Scroll to check-in" : "View actual run"} onPress={() => undefined} />
            ) : null}
            {workoutDetail.primaryAction !== "viewActualRun" ? (
              <SecondaryButton
                label={busyLabel === "skip-workout" ? "Skipping..." : "Skip workout"}
                disabled={busyLabel !== null}
                onPress={() =>
                  void runWithStatus("skip-workout", async () => {
                    await skipWorkout({ workoutId: workoutDetail.workout._id });
                    setMessage("Workout skipped.");
                  })
                }
              />
            ) : null}
            {workoutDetail.rescheduleOptions.length > 0 ? (
              <FieldGroup label="Move within this week">
                <ChoiceRow
                  options={workoutDetail.rescheduleOptions}
                  selected={selectedRescheduleDate || workoutDetail.rescheduleOptions[0]!}
                  onChange={setSelectedRescheduleDate}
                />
                <PrimaryButton
                  label={busyLabel === "reschedule-workout" ? "Moving..." : "Reschedule workout"}
                  disabled={busyLabel !== null || !selectedRescheduleDate}
                  onPress={() =>
                    void runWithStatus("reschedule-workout", async () => {
                      await rescheduleWorkout({
                        workoutId: workoutDetail.workout._id,
                        newScheduledDateKey: selectedRescheduleDate,
                      });
                      setMessage(`Workout moved to ${selectedRescheduleDate}.`);
                    })
                  }
                />
              </FieldGroup>
            ) : null}
          </StickyActionBar>
        </>
      ) : null}
    </ScrollView>
  );

  if (route.screen === "create") {
    return renderCreateFlow();
  }

  if (route.screen === "proposal") {
    return renderProposalView();
  }

  if (route.screen === "week") {
    return renderWeekAgenda();
  }

  if (route.screen === "workout") {
    return renderWorkoutView();
  }

  if (route.screen === "pastPlan") {
    return renderPastPlanView();
  }

  return renderOverview();
}
