import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { GOAL_TYPES, VOLUME_MODES, type UnitPreference, type VolumeMode } from "@slopmiles/domain";

import { api, type Id } from "../../convex";
import { ChoiceRow, Counter, Panel, PrimaryButton, SecondaryButton } from "../../components/common";
import { WorkoutExecutionDetail } from "../../components/workoutExecution";
import { styles } from "../../styles";
import { formatDistanceForDisplay } from "../../units";

type PlanGenerationMetadata = {
  model?: string;
};

type PlanGenerationResult = {
  numberOfWeeks: number;
  peakWeekVolume: number;
  weeklyVolumeProfile: Array<{
    weekNumber: number;
    percentOfPeak: number;
  }>;
  weeklyEmphasis: Array<{
    weekNumber: number;
    emphasis: string;
  }>;
  rationale: string;
  metadata?: PlanGenerationMetadata;
  corrections?: string[];
};

type PlanWeekStructure = {
  numberOfWeeks: number;
  weeklyVolumeProfile?: Array<{
    weekNumber: number;
    percentOfPeak: number;
  }>;
  weeklyEmphasis?: Array<{
    weekNumber: number;
    emphasis: string;
  }>;
};

function buildWeekRows(plan: PlanWeekStructure) {
  const percentByWeek = new Map<number, number>();
  const emphasisByWeek = new Map<number, string>();

  for (const entry of plan.weeklyVolumeProfile ?? []) {
    percentByWeek.set(entry.weekNumber, entry.percentOfPeak);
  }

  for (const entry of plan.weeklyEmphasis ?? []) {
    emphasisByWeek.set(entry.weekNumber, entry.emphasis);
  }

  const rows: Array<{ weekNumber: number; percent: number | null; emphasis: string | null }> = [];
  for (let weekNumber = 1; weekNumber <= plan.numberOfWeeks; weekNumber += 1) {
    rows.push({
      weekNumber,
      percent: percentByWeek.get(weekNumber) ?? null,
      emphasis: emphasisByWeek.get(weekNumber) ?? null,
    });
  }

  return rows;
}

function WeekStructure({ plan }: { plan: PlanWeekStructure }) {
  const rows = buildWeekRows(plan);
  const hasStructure = rows.some((row) => row.percent !== null || row.emphasis !== null);

  if (!hasStructure) {
    return <Text style={styles.helperText}>Weekly structure not available yet.</Text>;
  }

  return (
    <View style={styles.weekStructureList}>
      {rows.map((row) => (
        <View key={row.weekNumber} style={styles.weekStructureRow}>
          <Text style={styles.weekStructureWeek}>W{row.weekNumber}</Text>
          <Text style={styles.weekStructurePercent}>
            {row.percent === null ? "--" : `${Math.round(row.percent * 100)}%`}
          </Text>
          <Text style={styles.weekStructureEmphasis}>{row.emphasis ?? "-"}</Text>
        </View>
      ))}
    </View>
  );
}

function parsePlanGenerationResult(value: unknown): PlanGenerationResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as {
    numberOfWeeks?: unknown;
    peakWeekVolume?: unknown;
    weeklyVolumeProfile?: unknown;
    weeklyEmphasis?: unknown;
    rationale?: unknown;
    metadata?: {
      model?: unknown;
    };
    corrections?: unknown;
  };

  const model = candidate.metadata?.model;
  if (
    typeof candidate.numberOfWeeks !== "number" ||
    typeof candidate.peakWeekVolume !== "number" ||
    !Array.isArray(candidate.weeklyVolumeProfile) ||
    !Array.isArray(candidate.weeklyEmphasis) ||
    typeof candidate.rationale !== "string"
  ) {
    return null;
  }

  return {
    numberOfWeeks: candidate.numberOfWeeks,
    peakWeekVolume: candidate.peakWeekVolume,
    weeklyVolumeProfile: candidate.weeklyVolumeProfile as PlanGenerationResult["weeklyVolumeProfile"],
    weeklyEmphasis: candidate.weeklyEmphasis as PlanGenerationResult["weeklyEmphasis"],
    rationale: candidate.rationale,
    ...(typeof model === "string" ? { metadata: { model } } : {}),
    ...(Array.isArray(candidate.corrections)
      ? {
          corrections: candidate.corrections.filter((entry): entry is string => typeof entry === "string"),
        }
      : {}),
  };
}

function parseTargetDateText(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T00:00:00` : trimmed;
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
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

function formatDateKey(dateKey: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dateKey}T00:00:00Z`));
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

function formatWorkoutStatus(status: string): string {
  switch (status) {
    case "completed":
      return "Completed";
    case "planned":
      return "Planned";
    case "modified":
      return "Modified";
    case "skipped":
      return "Skipped";
    default:
      return status;
  }
}

function workoutStatusBadgeStyle(status: string) {
  switch (status) {
    case "completed":
      return styles.statusBadgeMatched;
    case "modified":
      return styles.statusBadgeNeedsReview;
    default:
      return styles.statusBadgeUnmatched;
  }
}

function formatAbsoluteVolume(volumeMode: VolumeMode, absoluteVolume: number, unitPreference: UnitPreference): string {
  if (volumeMode === "time") {
    return formatDurationSeconds(absoluteVolume);
  }

  return formatDistanceForDisplay(absoluteVolume, unitPreference);
}

function formatSegmentValue(value: number, unit: "seconds" | "meters"): string {
  return unit === "seconds" ? formatDurationSeconds(value) : `${Math.round(value)}m`;
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
  const target = formatSegmentValue(segment.targetValue, segment.targetUnit);
  const repsPrefix = segment.repetitions ? `${segment.repetitions} x ` : "";
  const rest =
    typeof segment.restValue === "number" && segment.restUnit ? ` / ${formatSegmentValue(segment.restValue, segment.restUnit)} easy` : "";
  return `${segment.label}: ${repsPrefix}${target} @ ${segment.paceZone}${rest}`;
}

export function PlanScreen({
  defaultVolumeMode,
  unitPreference,
}: {
  defaultVolumeMode: VolumeMode;
  unitPreference: UnitPreference;
}) {
  const requestPlanGeneration = useMutation(api.coach.requestPlanGeneration);
  const retryPlanGeneration = useMutation(api.coach.retryPlanGeneration);
  const createPlanFromGeneration = useMutation(api.coach.createPlanFromGeneration);
  const requestWeekDetailGeneration = useMutation(api.coach.requestWeekDetailGeneration);
  const retryWeekDetailGeneration = useMutation(api.coach.retryWeekDetailGeneration);
  const activateDraftPlan = useMutation(api.plans.activateDraftPlan);
  const updateDraftPlanBasics = useMutation(api.plans.updateDraftPlanBasics);
  const updatePlanStatus = useMutation(api.plans.updatePlanStatus);
  const planState = useQuery(api.plans.getPlanState, {});

  const [goalType, setGoalType] = useState<(typeof GOAL_TYPES)[number]>("race");
  const [goalLabel, setGoalLabel] = useState("5K");
  const [targetDateText, setTargetDateText] = useState("");
  const [goalTimeHours, setGoalTimeHours] = useState("0");
  const [goalTimeMinutes, setGoalTimeMinutes] = useState("0");
  const [goalTimeSecondsText, setGoalTimeSecondsText] = useState("0");
  const [numberOfWeeks, setNumberOfWeeks] = useState(10);
  const [volumeMode, setVolumeMode] = useState<VolumeMode>(defaultVolumeMode);
  const [creating, setCreating] = useState(false);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [draftPeakOverrideText, setDraftPeakOverrideText] = useState("");
  const [draftPeakInputs, setDraftPeakInputs] = useState<Record<string, string>>({});
  const [selectedWeekNumber, setSelectedWeekNumber] = useState<number | null>(null);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<Id<"workouts"> | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planMessage, setPlanMessage] = useState<string | null>(null);
  const [proposalChatDraft, setProposalChatDraft] = useState("");
  const planGenerationRequest = useQuery(api.coach.getLatestPlanGenerationRequest, {});

  const hasActivePlan = Boolean(planState?.activePlan);
  const proposal = parsePlanGenerationResult(planGenerationRequest?.result);
  const generationMetadata = proposal?.metadata;
  const draftGenerated = Boolean(planGenerationRequest?.consumedByPlanId);

  const targetDate = parseTargetDateText(targetDateText);
  const goalTimeSeconds = parseGoalTimeText(goalTimeHours, goalTimeMinutes, goalTimeSecondsText);
  const needsTargetDate = goalType === "race";
  const canGenerate = goalLabel.trim().length > 0 && (!needsTargetDate || targetDate !== null);

  const trainingWeeks = planState?.activePlan?.trainingWeeks ?? [];
  const weekDetail = useQuery(
    api.plans.getWeekDetail,
    planState?.activePlan && selectedWeekNumber
      ? {
          planId: planState.activePlan._id,
          weekNumber: selectedWeekNumber,
        }
      : "skip",
  );

  useEffect(() => {
    if (!planState?.activePlan) {
      setSelectedWeekNumber(null);
      setSelectedWorkoutId(null);
      return;
    }

    const preferredWeek =
      planState.activePlan.currentWeekNumber ??
      trainingWeeks[0]?.weekNumber ??
      null;

    setSelectedWeekNumber((current) => {
      if (current && trainingWeeks.some((week) => week.weekNumber === current)) {
        return current;
      }
      return preferredWeek;
    });
  }, [planState?.activePlan, trainingWeeks]);

  useEffect(() => {
    setSelectedWorkoutId(null);
  }, [selectedWeekNumber]);

  const selectedWeekSummary = useMemo(
    () => trainingWeeks.find((week) => week.weekNumber === selectedWeekNumber) ?? null,
    [selectedWeekNumber, trainingWeeks],
  );

  const canGenerateSelectedWeek = Boolean(weekDetail?.canGenerate);
  const isWeekRequestInFlight = weekDetail?.latestRequest?.status === "queued" || weekDetail?.latestRequest?.status === "inProgress";
  const isWeekRequestFailed = weekDetail?.latestRequest?.status === "failed";

  const onCreatePlan = async () => {
    if (!canGenerate) {
      setPlanError(needsTargetDate ? "Race goals require a valid target date." : "Goal label cannot be empty.");
      return;
    }

    setCreating(true);
    setPlanError(null);
    setPlanMessage(null);
    try {
      const result = await requestPlanGeneration({
        goalType,
        goalLabel: goalLabel.trim(),
        targetDate: targetDate ?? undefined,
        goalTimeSeconds: goalTimeSeconds ?? undefined,
        volumeMode,
        requestedNumberOfWeeks: goalType === "race" ? undefined : numberOfWeeks,
      });

      setPlanMessage(
        result.deduped
          ? "Using existing in-progress generation request."
          : "Plan generation requested from coach. Waiting for response...",
      );
    } catch (error) {
      setPlanError(String(error));
    } finally {
      setCreating(false);
    }
  };

  const onRetryPlanGeneration = async () => {
    if (!planGenerationRequest) {
      return;
    }

    try {
      setPlanError(null);
      setPlanMessage(null);
      await retryPlanGeneration({
        requestId: planGenerationRequest._id,
      });
      setPlanMessage("Retry queued. Waiting for coach response...");
    } catch (error) {
      setPlanError(String(error));
    }
  };

  const onCreateDraftFromProposal = async () => {
    if (!planGenerationRequest) {
      return;
    }

    setCreatingDraft(true);
    setPlanError(null);
    setPlanMessage(null);
    try {
      await createPlanFromGeneration({
        requestId: planGenerationRequest._id,
        peakWeekVolumeOverride:
          draftPeakOverrideText.trim().length > 0 && Number.isFinite(Number(draftPeakOverrideText))
            ? Number(draftPeakOverrideText)
            : undefined,
      });
      setPlanMessage("Draft created from coach proposal.");
    } catch (error) {
      setPlanError(String(error));
    } finally {
      setCreatingDraft(false);
    }
  };

  const onUpdateDraftPeak = async (planId: Id<"trainingPlans">) => {
    const raw = draftPeakInputs[String(planId)]?.trim() ?? "";
    const peakWeekVolume = Number(raw);
    if (!raw || !Number.isFinite(peakWeekVolume) || peakWeekVolume <= 0) {
      setPlanError("Draft peak volume must be a positive number.");
      return;
    }

    try {
      setPlanError(null);
      setPlanMessage(null);
      await updateDraftPlanBasics({ planId, peakWeekVolume });
      setPlanMessage("Draft peak volume updated.");
    } catch (error) {
      setPlanError(String(error));
    }
  };

  const onActivateDraft = async (planId: Id<"trainingPlans">) => {
    try {
      setPlanError(null);
      setPlanMessage(null);
      await activateDraftPlan({
        planId,
        canonicalTimeZoneId: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      });
      setPlanMessage("Draft activated. Current week generation queued.");
    } catch (error) {
      setPlanError(String(error));
    }
  };

  const onAbandonPlan = async (planId: Id<"trainingPlans">) => {
    try {
      setPlanError(null);
      setPlanMessage(null);
      await updatePlanStatus({ planId, status: "abandoned" });
      setPlanMessage("Active plan abandoned. You can activate a draft now.");
    } catch (error) {
      setPlanError(String(error));
    }
  };

  const onCompletePlan = async (planId: Id<"trainingPlans">) => {
    try {
      setPlanError(null);
      setPlanMessage(null);
      await updatePlanStatus({ planId, status: "completed" });
      setPlanMessage("Active plan marked complete.");
    } catch (error) {
      setPlanError(String(error));
    }
  };

  const onGenerateWeek = async () => {
    if (!planState?.activePlan || !selectedWeekNumber) {
      return;
    }

    try {
      setPlanError(null);
      setPlanMessage(null);
      await requestWeekDetailGeneration({
        planId: planState.activePlan._id,
        weekNumber: selectedWeekNumber,
      });
      setPlanMessage(`Week ${selectedWeekNumber} generation queued.`);
    } catch (error) {
      setPlanError(String(error));
    }
  };

  const onRetryWeek = async () => {
    if (!weekDetail?.latestRequest?._id) {
      return;
    }

    try {
      setPlanError(null);
      setPlanMessage(null);
      await retryWeekDetailGeneration({
        requestId: weekDetail.latestRequest._id,
      });
      setPlanMessage(`Week ${selectedWeekNumber} retry queued.`);
    } catch (error) {
      setPlanError(String(error));
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.kicker}>Plan</Text>
      <Text style={styles.heading}>{hasActivePlan ? "Active plan" : "No active plan"}</Text>

      {planError ? <Text style={styles.errorText}>{planError}</Text> : null}
      {planMessage ? <Text style={styles.helperText}>{planMessage}</Text> : null}

      <Panel title="Create Plan">
        <Text style={styles.label}>Goal type</Text>
        <ChoiceRow
          options={GOAL_TYPES}
          selected={goalType}
          onChange={(value) => setGoalType(value as (typeof GOAL_TYPES)[number])}
        />
        <Text style={styles.label}>Goal label</Text>
        <TextInput
          style={styles.input}
          value={goalLabel}
          onChangeText={setGoalLabel}
          autoCapitalize="words"
          placeholder="5K, Half Marathon, Base Building"
          placeholderTextColor="#7a848c"
        />
        <Text style={styles.label}>{goalType === "race" ? "Target date (required)" : "Target date (optional)"}</Text>
        <TextInput
          style={styles.input}
          value={targetDateText}
          onChangeText={setTargetDateText}
          autoCapitalize="none"
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#7a848c"
        />
        <Text style={styles.label}>Goal time (optional)</Text>
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
        <Text style={styles.label}>Weeks</Text>
        <Counter value={numberOfWeeks} min={4} max={24} onChange={setNumberOfWeeks} />
        <Text style={styles.label}>Volume mode</Text>
        <ChoiceRow
          options={VOLUME_MODES}
          selected={volumeMode}
          onChange={(value) => setVolumeMode(value as VolumeMode)}
        />
        <PrimaryButton
          label={creating ? "Requesting Coach Plan..." : "Generate Plan with Coach"}
          onPress={onCreatePlan}
          disabled={creating || !canGenerate}
        />
      </Panel>

      <Panel title="Plan Generation">
        {!planGenerationRequest ? (
          <Text style={styles.bodyText}>No plan generation requested yet.</Text>
        ) : (
          <>
            <Text style={styles.bodyText}>Status: {planGenerationRequest.status}</Text>
            {planGenerationRequest.status === "inProgress" || planGenerationRequest.status === "queued" ? (
              <Text style={styles.helperText}>Your coach is building the plan...</Text>
            ) : null}
            {planGenerationRequest.status === "failed" ? (
              <Text style={styles.errorText}>Couldn't reach your coach - check your connection.</Text>
            ) : null}
            {proposal ? (
              <>
                <Text style={styles.bodyText}>
                  Proposed peak: {Math.round(proposal.peakWeekVolume)} {volumeMode === "time" ? "min" : "m"}
                </Text>
                <Text style={styles.bodyText}>Proposed weeks: {proposal.numberOfWeeks}</Text>
                <Text style={styles.helperText}>
                  Override draft peak volume if you want a different ceiling before activation.
                </Text>
                <TextInput
                  style={styles.input}
                  value={draftPeakOverrideText}
                  onChangeText={setDraftPeakOverrideText}
                  keyboardType="decimal-pad"
                  placeholder={String(Math.round(proposal.peakWeekVolume))}
                  placeholderTextColor="#7a848c"
                />
                <Text style={styles.helperText}>{proposal.rationale}</Text>
                <WeekStructure plan={proposal} />
                {generationMetadata?.model ? (
                  <Text style={styles.helperText}>Model: {generationMetadata.model}</Text>
                ) : null}
                {proposal.corrections && proposal.corrections.length > 0 ? (
                  <Text style={styles.helperText}>Validator corrections applied: {proposal.corrections.length}</Text>
                ) : null}
                {draftGenerated ? (
                  <Text style={styles.helperText}>Draft plan already created from this proposal.</Text>
                ) : (
                  <PrimaryButton
                    label={creatingDraft ? "Creating Draft..." : "Create Draft from Proposal"}
                    onPress={onCreateDraftFromProposal}
                    disabled={creatingDraft || planGenerationRequest.status !== "succeeded"}
                  />
                )}
              </>
            ) : null}
            {planGenerationRequest.status === "succeeded" && !proposal ? (
              <Text style={styles.helperText}>Plan generation succeeded. Loading proposal...</Text>
            ) : null}
            {planGenerationRequest.status === "failed" ? (
              <PrimaryButton label="Retry Generation" onPress={onRetryPlanGeneration} />
            ) : null}
          </>
        )}
      </Panel>

      {proposal ? (
        <Panel title="Refine Proposal">
          <Text style={styles.helperText}>
            Use the peak override above for direct volume changes. Use the Coach tab for goal, timeline, and schedule tradeoff questions before activating.
          </Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={proposalChatDraft}
            onChangeText={setProposalChatDraft}
            placeholder="Draft a note to yourself about what you still want to pressure-test..."
            placeholderTextColor="#7a848c"
            multiline
          />
        </Panel>
      ) : null}

      {planState?.activePlan ? (
        <Panel title="Current Active Plan">
          <Text style={styles.bodyText}>
            {planState.activePlan.goal.label} - {planState.activePlan.numberOfWeeks} weeks - peak{" "}
            {Math.round(planState.activePlan.peakWeekVolume)} {planState.activePlan.volumeMode === "time" ? "min" : "m"}
          </Text>
          {planState.activePlan.goal.targetDate ? (
            <Text style={styles.helperText}>Target date: {new Date(planState.activePlan.goal.targetDate).toLocaleDateString()}</Text>
          ) : null}
          {typeof planState.activePlan.goal.goalTimeSeconds === "number" ? (
            <Text style={styles.helperText}>Goal time: {formatGoalTime(planState.activePlan.goal.goalTimeSeconds)}</Text>
          ) : null}
          {planState.activePlan.startDateKey ? (
            <Text style={styles.helperText}>
              Canonical week 1 starts {planState.activePlan.startDateKey} in {planState.activePlan.canonicalTimeZoneId}
            </Text>
          ) : null}

          <Text style={styles.label}>Weeks</Text>
          <View style={styles.weekList}>
            {trainingWeeks.map((week) => {
              const isSelected = week.weekNumber === selectedWeekNumber;
              const badge =
                week.weekNumber === planState.activePlan.currentWeekNumber
                  ? "Current"
                  : week.weekNumber === planState.activePlan.nextWeekNumber
                    ? "Next"
                    : null;

              return (
                <Pressable
                  key={String(week._id)}
                  style={[styles.weekListRow, isSelected ? styles.weekListRowActive : null]}
                  onPress={() => setSelectedWeekNumber(week.weekNumber)}
                >
                  <View style={styles.weekListHeader}>
                    <Text style={styles.weekListTitle}>Week {week.weekNumber}</Text>
                    {badge ? <Text style={styles.weekBadge}>{badge}</Text> : null}
                  </View>
                  <Text style={styles.helperText}>
                    {Math.round(week.targetVolumePercent * 100)}% of peak · {week.emphasis || "No emphasis"}
                  </Text>
                  <Text style={styles.helperText}>
                    {formatDateKey(week.weekStartDateKey)} - {formatDateKey(week.weekEndDateKey)} ·{" "}
                    {week.generated ? "Generated" : "Outline only"}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {selectedWeekSummary ? (
            <View style={styles.weekDetailBlock}>
              <Text style={styles.weekDetailHeading}>Week {selectedWeekSummary.weekNumber}</Text>
              <Text style={styles.helperText}>
                {formatDateKey(selectedWeekSummary.weekStartDateKey)} - {formatDateKey(selectedWeekSummary.weekEndDateKey)}
              </Text>
              <Text style={styles.bodyText}>
                Target volume:{" "}
                {formatAbsoluteVolume(planState.activePlan.volumeMode, selectedWeekSummary.targetVolumeAbsolute, unitPreference)}
                {" · "}
                {Math.round(selectedWeekSummary.targetVolumePercent * 100)}% of peak
              </Text>
              <Text style={styles.helperText}>Emphasis: {selectedWeekSummary.emphasis || "No emphasis yet"}</Text>

              {weekDetail === undefined ? (
                <Text style={styles.helperText}>Loading week detail...</Text>
              ) : (
                <>
                  {weekDetail.latestRequest?.status === "failed" ? (
                    <Text style={styles.errorText}>{weekDetail.latestRequest.errorMessage ?? "Generation failed."}</Text>
                  ) : null}
                  {isWeekRequestInFlight ? (
                    <Text style={styles.helperText}>Coach is building this week now...</Text>
                  ) : null}
                  {!selectedWeekSummary.generated ? (
                    canGenerateSelectedWeek ? (
                      isWeekRequestFailed ? (
                        <PrimaryButton label="Retry Generation" onPress={onRetryWeek} disabled={isWeekRequestInFlight} />
                      ) : (
                        <PrimaryButton label="Generate Workouts" onPress={onGenerateWeek} disabled={isWeekRequestInFlight} />
                      )
                    ) : (
                      <Text style={styles.helperText}>Only the current week and next week can be generated.</Text>
                    )
                  ) : null}

                  {weekDetail.week.coachNotes ? (
                    <Text style={styles.helperText}>{weekDetail.week.coachNotes}</Text>
                  ) : null}

                  {weekDetail.workouts.length > 0 ? (
                    <View style={styles.workoutList}>
                      {weekDetail.workouts.map((workout) => {
                        const expanded = selectedWorkoutId === workout._id;
                        return (
                          <Pressable
                            key={String(workout._id)}
                            style={[styles.workoutCard, expanded ? styles.workoutCardActive : null]}
                            onPress={() =>
                              setSelectedWorkoutId((current) => (current === workout._id ? null : workout._id))
                            }
                          >
                            <View style={styles.statusRow}>
                              <Text style={styles.workoutTitle}>
                                {formatDateKey(workout.scheduledDateKey)} · {formatWorkoutType(workout.type)}
                              </Text>
                              <Text style={[styles.statusBadge, workoutStatusBadgeStyle(workout.status)]}>
                                {formatWorkoutStatus(workout.status)}
                              </Text>
                            </View>
                            <Text style={styles.helperText}>
                              {formatAbsoluteVolume(planState.activePlan.volumeMode, workout.absoluteVolume, unitPreference)}
                              {" · "}
                              {Math.round(workout.volumePercent * 100)}% of peak · {workout.venue}
                            </Text>
                            {expanded ? (
                              <>
                                {workout.notes ? <Text style={styles.bodyText}>{workout.notes}</Text> : null}
                                {workout.segments.length > 0 ? (
                                  <View style={styles.segmentList}>
                                    {workout.segments.map((segment, index) => (
                                      <Text key={`${String(workout._id)}-${index}`} style={styles.helperText}>
                                        {formatSegment(segment)}
                                      </Text>
                                    ))}
                                  </View>
                                ) : null}
                                {workout.execution ? (
                                  <WorkoutExecutionDetail
                                    executionId={workout.execution._id}
                                    unitPreference={unitPreference}
                                  />
                                ) : (
                                  <Text style={styles.helperText}>
                                    No imported run is linked to this workout yet.
                                  </Text>
                                )}
                              </>
                            ) : null}
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : selectedWeekSummary.generated ? (
                    <Text style={styles.helperText}>No workouts returned for this week.</Text>
                  ) : null}
                </>
              )}
            </View>
          ) : null}

          <PrimaryButton label="Mark Plan Complete" onPress={() => onCompletePlan(planState.activePlan!._id)} />
          <SecondaryButton label="Abandon Active Plan" onPress={() => onAbandonPlan(planState.activePlan!._id)} />
        </Panel>
      ) : null}

      <Panel title="Draft Plans">
        {planState?.draftPlans.length ? (
          planState.draftPlans.map((draft) => (
            <View key={String(draft._id)} style={styles.listItem}>
              <Text style={styles.bodyText}>
                {draft.goal.label} - {draft.numberOfWeeks} weeks - peak {Math.round(draft.peakWeekVolume)}{" "}
                {draft.volumeMode === "time" ? "min" : "m"}
              </Text>
              {draft.goal.targetDate ? (
                <Text style={styles.helperText}>Target date: {new Date(draft.goal.targetDate).toLocaleDateString()}</Text>
              ) : null}
              {typeof draft.goal.goalTimeSeconds === "number" ? (
                <Text style={styles.helperText}>Goal time: {formatGoalTime(draft.goal.goalTimeSeconds)}</Text>
              ) : null}
              <WeekStructure plan={draft} />
              <Text style={styles.label}>Peak week override</Text>
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
              <SecondaryButton label="Save Draft Peak" onPress={() => onUpdateDraftPeak(draft._id)} />
              <PrimaryButton
                label={hasActivePlan ? "Cannot activate while active exists" : "Activate Draft"}
                disabled={hasActivePlan}
                onPress={() => onActivateDraft(draft._id)}
              />
            </View>
          ))
        ) : (
          <Text style={styles.bodyText}>No draft plans yet.</Text>
        )}
      </Panel>
    </ScrollView>
  );
}
