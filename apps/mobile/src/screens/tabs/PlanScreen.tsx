import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import {
  WEEKDAYS,
  VOLUME_MODES,
  formatDateKeyForDisplay,
  formatDistanceForDisplay,
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
import { styles } from "../../styles";
import type { PlanRoute } from "../../types";

const RACE_GOALS = ["5K", "10K", "Half Marathon", "Marathon", "Custom"] as const;
const NON_RACE_GOALS = ["Base Building", "Recovery", "Custom"] as const;
const PLAN_GOAL_TYPES = ["race", "nonRace"] as const;
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
}): string {
  const target = segment.targetUnit === "seconds" ? formatDurationSeconds(segment.targetValue) : `${Math.round(segment.targetValue)}m`;
  const reps = segment.repetitions ? `${segment.repetitions} x ` : "";
  const rest =
    typeof segment.restValue === "number" && segment.restUnit
      ? ` / ${segment.restUnit === "seconds" ? formatDurationSeconds(segment.restValue) : `${Math.round(segment.restValue)}m`} easy`
      : "";

  return `${segment.label}: ${reps}${target} @ ${segment.paceZone}${rest}`;
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
  const planOverview = useQuery(api.mobileUx.getPlanOverview, {});
  const weekAgenda = useQuery(
    api.mobileUx.getWeekAgenda,
    planOverview?.activePlan && route.screen === "week"
      ? {
          planId: planOverview.activePlan._id,
          weekNumber: route.weekNumber,
        }
      : "skip",
  );
  const workoutDetail = useQuery(
    api.mobileUx.getWorkoutDetailView,
    route.screen === "workout"
      ? {
          workoutId: route.workoutId,
        }
      : "skip",
  );

  const requestPlanGeneration = useMutation(api.coach.requestPlanGeneration);
  const retryPlanGeneration = useMutation(api.coach.retryPlanGeneration);
  const createPlanFromGeneration = useMutation(api.coach.createPlanFromGeneration);
  const activateDraftPlan = useMutation(api.plans.activateDraftPlan);
  const updateDraftPlanBasics = useMutation(api.plans.updateDraftPlanBasics);
  const updatePlanStatus = useMutation(api.plans.updatePlanStatus);
  const requestWeekDetailGeneration = useMutation(api.coach.requestWeekDetailGeneration);
  const retryWeekDetailGeneration = useMutation(api.coach.retryWeekDetailGeneration);
  const skipWorkout = useMutation(api.workouts.skipWorkout);
  const rescheduleWorkout = useMutation(api.workouts.rescheduleWorkout);
  const saveWeekAvailabilityOverride = useMutation(api.companion.saveWeekAvailabilityOverride);
  const clearWeekAvailabilityOverride = useMutation(api.companion.clearWeekAvailabilityOverride);
  const toggleStrengthWorkout = useMutation(api.companion.toggleStrengthWorkout);

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
  const [draftPeakInputs, setDraftPeakInputs] = useState<Record<string, string>>({});
  const [selectedRescheduleDate, setSelectedRescheduleDate] = useState<string>("");
  const [overrideDays, setOverrideDays] = useState<Array<(typeof WEEKDAYS)[number]>>([]);
  const [overrideNote, setOverrideNote] = useState("");
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const activePlan = planOverview?.activePlan ?? null;
  const proposal = planOverview?.proposal?.result ?? null;
  const selectedGoalLabel = goalPreset === "Custom" ? customGoalLabel.trim() : goalPreset;
  const targetDate = normalizeDate(targetDateValue);
  const formattedTargetDate = formatTargetDate(targetDateValue);
  const goalTimeSeconds = parseGoalTimeText(goalTimeHours, goalTimeMinutes, goalTimeSecondsText);
  const createStepCount = 3;

  useEffect(() => {
    if (!proposal) {
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
            label={busyLabel === "request-plan" ? "Requesting coach plan..." : "Request coach proposal"}
            disabled={!canSubmitCreate || busyLabel !== null}
            onPress={() =>
              void runWithStatus("request-plan", async () => {
                await requestPlanGeneration({
                  goalType,
                  goalLabel: selectedGoalLabel,
                  targetDate: targetDate ?? undefined,
                  goalTimeSeconds: goalType === "race" ? goalTimeSeconds ?? undefined : undefined,
                  volumeMode,
                  requestedNumberOfWeeks: goalType === "race" ? undefined : Number(numberOfWeeks),
                });
                setMessage("Plan generation requested. The latest proposal will appear in Proposal Review.");
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
        title="Proposal review"
        subtitle="Review the latest coach-generated structure before you create or activate a draft."
        actionLabel="Overview"
        onAction={() => onRouteChange({ screen: "overview" })}
      />

      {error ? <StatusBanner tone="error" message={error} /> : null}
      {message ? <StatusBanner tone="success" message={message} /> : null}

      {!planOverview?.proposal ? (
        <EmptyStateCard
          title="No proposal yet"
          body="Start the guided create flow, then come back here once the coach finishes building the structure."
          actionLabel="Create plan"
          onAction={() => onRouteChange({ screen: "create" })}
        />
      ) : (
        <>
          <SectionCard title="Generation status" description={`Requested ${new Date(planOverview.proposal.createdAt).toLocaleString()}`}>
            <Text style={styles.bodyText}>Status: {planOverview.proposal.status}</Text>
            {planOverview.proposal.errorMessage ? <Text style={styles.errorText}>{planOverview.proposal.errorMessage}</Text> : null}
            {planOverview.proposal.status === "failed" ? (
              <PrimaryButton
                label={busyLabel === "retry-proposal" ? "Retrying..." : "Retry generation"}
                disabled={busyLabel !== null}
                onPress={() =>
                  void runWithStatus("retry-proposal", async () => {
                    await retryPlanGeneration({ requestId: planOverview.proposal!._id });
                    setMessage("Retry queued.");
                  })
                }
              />
            ) : null}
          </SectionCard>

          {proposal ? (
            <>
              <SectionCard title="Coach proposal" description={proposal.rationale}>
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
                <PrimaryButton
                  label={busyLabel === "create-draft" ? "Creating draft..." : "Create draft from proposal"}
                  disabled={busyLabel !== null || planOverview.proposal.consumedByPlanId !== null || planOverview.proposal.status !== "succeeded"}
                  onPress={() =>
                    void runWithStatus("create-draft", async () => {
                      await createPlanFromGeneration({
                        requestId: planOverview.proposal!._id,
                        peakWeekVolumeOverride:
                          proposalPeakOverride.trim().length > 0 && Number.isFinite(Number(proposalPeakOverride))
                            ? Number(proposalPeakOverride)
                            : undefined,
                      });
                      setMessage("Draft created from proposal.");
                      onRouteChange({ screen: "overview" });
                    })
                  }
                />
              </SectionCard>
            </>
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
        <SectionCard title={activePlan.goal.label} description={`${activePlan.numberOfWeeks} weeks · peak ${Math.round(activePlan.peakWeekVolume)} ${activePlan.volumeMode === "time" ? "min" : "m"}`}>
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

      <SectionCard title="Latest proposal" description="The newest coach-generated structure, if one exists.">
        {planOverview?.proposal ? (
          <>
            <Text style={styles.bodyText}>Status: {planOverview.proposal.status}</Text>
            <SecondaryButton label="Open proposal review" onPress={() => onRouteChange({ screen: "proposal" })} />
          </>
        ) : (
          <Text style={styles.bodyText}>No proposal in progress yet.</Text>
        )}
      </SectionCard>

      <SectionCard title="Draft plans" description="Drafts stay separate from the active plan until you activate them.">
        {planOverview?.draftPlans.length ? (
          planOverview.draftPlans.map((draft) => (
            <View key={String(draft._id)} style={styles.subtleBlock}>
              <Text style={styles.sectionCardTitle}>{draft.goal.label}</Text>
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
            {!weekAgenda.week.generated ? (
              <PrimaryButton
                label={
                  weekAgenda.latestRequest?.status === "failed"
                    ? busyLabel === "retry-week"
                      ? "Retrying..."
                      : "Retry generation"
                    : busyLabel === "generate-week"
                      ? "Generating..."
                      : "Generate workouts"
                }
                disabled={busyLabel !== null || !weekAgenda.canGenerate}
                onPress={() =>
                  void runWithStatus(
                    weekAgenda.latestRequest?.status === "failed" ? "retry-week" : "generate-week",
                    async () => {
                      if (weekAgenda.latestRequest?.status === "failed" && weekAgenda.latestRequest?._id) {
                        await retryWeekDetailGeneration({ requestId: weekAgenda.latestRequest._id });
                      } else if (activePlan) {
                        await requestWeekDetailGeneration({
                          planId: activePlan._id,
                          weekNumber: weekAgenda.week.weekNumber,
                        });
                      }
                      setMessage(`Week ${weekAgenda.week.weekNumber} generation queued.`);
                    },
                  )
                }
              />
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
                  {formatSegment(segment)}
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

  return renderOverview();
}
