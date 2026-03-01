import { useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { GOAL_TYPES, VOLUME_MODES, type VolumeMode } from "@slopmiles/domain";

import { api, type Id } from "../../convex";
import { ChoiceRow, Counter, Panel, PrimaryButton } from "../../components/common";
import { styles } from "../../styles";

export function PlanScreen({
  defaultVolumeMode,
}: {
  defaultVolumeMode: VolumeMode;
}) {
  const createPlan = useMutation(api.plans.createPlan);
  const activateDraftPlan = useMutation(api.plans.activateDraftPlan);
  const updatePlanStatus = useMutation(api.plans.updatePlanStatus);
  const planState = useQuery(api.plans.getPlanState, {});

  const [goalType, setGoalType] = useState<(typeof GOAL_TYPES)[number]>("race");
  const [goalLabel, setGoalLabel] = useState("5K");
  const [numberOfWeeks, setNumberOfWeeks] = useState(10);
  const [volumeMode, setVolumeMode] = useState<VolumeMode>(defaultVolumeMode);
  const [peakWeekVolume, setPeakWeekVolume] = useState(300);
  const [creating, setCreating] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planMessage, setPlanMessage] = useState<string | null>(null);

  const hasActivePlan = Boolean(planState?.activePlan);

  const onCreatePlan = async () => {
    setCreating(true);
    setPlanError(null);
    setPlanMessage(null);
    try {
      const result = await createPlan({
        goalType,
        goalLabel: goalLabel.trim(),
        numberOfWeeks,
        volumeMode,
        peakWeekVolume,
      });

      setPlanMessage(
        result.createdAsDraft
          ? "Plan saved as draft because another plan is active."
          : "Plan created and activated.",
      );
    } catch (error) {
      setPlanError(String(error));
    } finally {
      setCreating(false);
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
        <Text style={styles.label}>Weeks</Text>
        <Counter value={numberOfWeeks} min={4} max={24} onChange={setNumberOfWeeks} />
        <Text style={styles.label}>Volume mode</Text>
        <ChoiceRow
          options={VOLUME_MODES}
          selected={volumeMode}
          onChange={(value) => setVolumeMode(value as VolumeMode)}
        />
        <Text style={styles.label}>Peak week volume ({volumeMode === "time" ? "minutes" : "meters"})</Text>
        <Counter
          value={peakWeekVolume}
          min={volumeMode === "time" ? 60 : 5000}
          max={volumeMode === "time" ? 1000 : 200000}
          onChange={setPeakWeekVolume}
        />
        <PrimaryButton
          label={hasActivePlan ? "Save Draft Plan" : "Create and Activate Plan"}
          onPress={onCreatePlan}
          disabled={creating || goalLabel.trim().length === 0}
        />
      </Panel>

      {planState?.activePlan ? (
        <Panel title="Current Active Plan">
          <Text style={styles.bodyText}>
            {planState.activePlan.goal.label} - {planState.activePlan.numberOfWeeks} weeks - peak{" "}
            {Math.round(planState.activePlan.peakWeekVolume)} {planState.activePlan.volumeMode === "time" ? "min" : "m"}
          </Text>
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
