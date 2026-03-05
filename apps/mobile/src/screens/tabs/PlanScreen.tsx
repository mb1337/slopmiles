import { useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { GOAL_TYPES, VOLUME_MODES, type VolumeMode } from "@slopmiles/domain";

import { api, type Id } from "../../convex";
import { ChoiceRow, Counter, Panel, PrimaryButton } from "../../components/common";
import { styles } from "../../styles";

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

export function PlanScreen({
  defaultVolumeMode,
}: {
  defaultVolumeMode: VolumeMode;
}) {
  const requestPlanGeneration = useMutation(api.coach.requestPlanGeneration);
  const retryPlanGeneration = useMutation(api.coach.retryPlanGeneration);
  const createPlanFromGeneration = useMutation(api.coach.createPlanFromGeneration);
  const activateDraftPlan = useMutation(api.plans.activateDraftPlan);
  const updatePlanStatus = useMutation(api.plans.updatePlanStatus);
  const planState = useQuery(api.plans.getPlanState, {});

  const [goalType, setGoalType] = useState<(typeof GOAL_TYPES)[number]>("race");
  const [goalLabel, setGoalLabel] = useState("5K");
  const [targetDateText, setTargetDateText] = useState("");
  const [numberOfWeeks, setNumberOfWeeks] = useState(10);
  const [volumeMode, setVolumeMode] = useState<VolumeMode>(defaultVolumeMode);
  const [creating, setCreating] = useState(false);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planMessage, setPlanMessage] = useState<string | null>(null);
  const [proposalChatDraft, setProposalChatDraft] = useState("");
  const [planGenerationRequestId, setPlanGenerationRequestId] = useState<Id<"aiRequests"> | null>(null);

  const planGenerationRequest = useQuery(
    api.coach.getPlanGenerationRequest,
    planGenerationRequestId
      ? {
          requestId: planGenerationRequestId,
        }
      : "skip",
  );

  const hasActivePlan = Boolean(planState?.activePlan);
  const proposal = parsePlanGenerationResult(planGenerationRequest?.result);
  const generationMetadata = proposal?.metadata;
  const draftGenerated = Boolean(planGenerationRequest?.consumedByPlanId);

  const targetDate = parseTargetDateText(targetDateText);
  const needsTargetDate = goalType === "race";
  const canGenerate = goalLabel.trim().length > 0 && (!needsTargetDate || targetDate !== null);

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
        volumeMode,
        requestedNumberOfWeeks: goalType === "race" ? undefined : numberOfWeeks,
      });

      setPlanGenerationRequestId(result.requestId);

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
    if (!planGenerationRequestId) {
      return;
    }

    try {
      setPlanError(null);
      setPlanMessage(null);
      const result = await retryPlanGeneration({
        requestId: planGenerationRequestId,
      });
      setPlanGenerationRequestId(result.requestId);
      setPlanMessage("Retry queued. Waiting for coach response...");
    } catch (error) {
      setPlanError(String(error));
    }
  };

  const onCreateDraftFromProposal = async () => {
    if (!planGenerationRequestId) {
      return;
    }

    setCreatingDraft(true);
    setPlanError(null);
    setPlanMessage(null);
    try {
      await createPlanFromGeneration({
        requestId: planGenerationRequestId,
      });
      setPlanMessage("Draft created from coach proposal.");
    } catch (error) {
      setPlanError(String(error));
    } finally {
      setCreatingDraft(false);
    }
  };

  const onActivateDraft = async (planId: Id<"trainingPlans">) => {
    try {
      setPlanError(null);
      setPlanMessage(null);
      await activateDraftPlan({ planId });
      setPlanMessage("Draft activated.");
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
        {!planGenerationRequestId ? (
          <Text style={styles.bodyText}>No plan generation requested yet.</Text>
        ) : planGenerationRequest ? (
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
        ) : (
          <Text style={styles.helperText}>Loading generation status...</Text>
        )}
      </Panel>

      {proposal ? (
        <Panel title="Refine Proposal">
          <Text style={styles.helperText}>Chat-based proposal refinement is coming soon.</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={proposalChatDraft}
            onChangeText={setProposalChatDraft}
            placeholder="Ask coach to tweak peak volume, emphasis, or timeline..."
            placeholderTextColor="#7a848c"
            multiline
          />
          <PrimaryButton label="Send to Coach (Coming Soon)" disabled />
        </Panel>
      ) : null}

      {planState?.activePlan ? (
        <Panel title="Current Active Plan">
          <Text style={styles.bodyText}>
            {planState.activePlan.goal.label} - {planState.activePlan.numberOfWeeks} weeks - peak{" "}
            {Math.round(planState.activePlan.peakWeekVolume)} {planState.activePlan.volumeMode === "time" ? "min" : "m"}
          </Text>
          <WeekStructure plan={planState.activePlan} />
          <PrimaryButton
            label="Abandon Active Plan"
            onPress={() => onAbandonPlan(planState.activePlan!._id)}
          />
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
              <WeekStructure plan={draft} />
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
