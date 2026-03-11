import { Text, View } from "react-native";

import type { PlanAssessmentStateView } from "@slopmiles/component-contracts";

import { PrimaryButton, SecondaryButton } from "./common";
import { styles } from "../styles";

export function PlanAssessmentSummary({
  state,
  onRetry,
  retrying,
}: {
  state: PlanAssessmentStateView;
  onRetry?: (requestId: string) => void;
  retrying?: boolean;
}) {
  if (state.status === "none") {
    return <Text style={styles.bodyText}>No assessment yet.</Text>;
  }

  if (state.status === "pending") {
    return (
      <View style={styles.sectionCardBody}>
        <Text style={styles.bodyText}>Assessment pending. The coach is still reviewing the block.</Text>
        {state.request?.errorMessage ? <Text style={styles.helperText}>{state.request.errorMessage}</Text> : null}
        {state.request?._id && onRetry ? (
          <SecondaryButton
            label={retrying ? "Retrying..." : "Retry now"}
            disabled={retrying}
            onPress={() => onRetry(state.request!._id)}
          />
        ) : null}
      </View>
    );
  }

  if (state.status === "failed") {
    return (
      <View style={styles.sectionCardBody}>
        <Text style={styles.bodyText}>{state.request?.errorMessage ?? "Assessment failed."}</Text>
        {state.request?._id && onRetry ? (
          <PrimaryButton
            label={retrying ? "Retrying..." : "Retry assessment"}
            disabled={retrying}
            onPress={() => onRetry(state.request!._id)}
          />
        ) : null}
      </View>
    );
  }

  const assessment = state.assessment;
  if (!assessment) {
    return <Text style={styles.bodyText}>Assessment unavailable.</Text>;
  }

  return (
    <View style={styles.sectionCardBody}>
      <Text style={styles.bodyText}>{assessment.summary}</Text>
      <Text style={styles.helperText}>
        Volume {Math.round(assessment.volumeAdherence * 100)}% · Pace {Math.round(assessment.paceAdherence * 100)}% · VDOT{" "}
        {assessment.vdotStart.toFixed(1)} → {assessment.vdotEnd.toFixed(1)}
      </Text>
      <Text style={styles.sectionCardTitle}>Highlights</Text>
      {assessment.highlights.map((item) => (
        <Text key={item} style={styles.helperText}>
          - {item}
        </Text>
      ))}
      <Text style={styles.sectionCardTitle}>Improve next</Text>
      {assessment.areasForImprovement.map((item) => (
        <Text key={item} style={styles.helperText}>
          - {item}
        </Text>
      ))}
      <Text style={styles.sectionCardTitle}>Next block</Text>
      <Text style={styles.bodyText}>{assessment.nextPlanSuggestion}</Text>
      <Text style={styles.sectionCardTitle}>Discuss with coach</Text>
      {assessment.discussionPrompts.map((item) => (
        <Text key={item} style={styles.helperText}>
          - {item}
        </Text>
      ))}
    </View>
  );
}
