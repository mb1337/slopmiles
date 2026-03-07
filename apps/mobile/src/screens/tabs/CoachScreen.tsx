import { useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../convex";
import { Panel, PrimaryButton } from "../../components/common";
import { styles } from "../../styles";

function formatMessageTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function CoachScreen() {
  const conversation = useQuery(api.coach.getCoachConversation, {});
  const sendCoachMessage = useMutation(api.coach.sendCoachMessage);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSend = async () => {
    const body = draft.trim();
    if (body.length === 0) {
      return;
    }

    setSending(true);
    setError(null);
    try {
      await sendCoachMessage({ body });
      setDraft("");
    } catch (sendError) {
      setError(String(sendError));
    } finally {
      setSending(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.kicker}>Coach</Text>
      <Text style={styles.heading}>Coach inbox</Text>

      <Panel title="Current Context">
        {conversation === undefined ? <Text style={styles.helperText}>Loading coach context...</Text> : null}
        {conversation?.activePlan ? (
          <Text style={styles.bodyText}>
            Active plan peak: {Math.round(conversation.activePlan.peakWeekVolume)}{" "}
            {conversation.activePlan.volumeMode === "time" ? "min" : "m"} across {conversation.activePlan.numberOfWeeks} weeks.
          </Text>
        ) : (
          <Text style={styles.bodyText}>No active plan yet. The coach can still help you pressure-test goals and constraints.</Text>
        )}
        {conversation?.runningSchedule ? (
          <Text style={styles.helperText}>
            Schedule: {conversation.runningSchedule.runningDaysPerWeek} days on{" "}
            {conversation.runningSchedule.preferredRunningDays.join(", ")}
          </Text>
        ) : null}
        <Text style={styles.helperText}>
          Personality: {conversation?.personality.name ?? "noNonsense"} · Competitiveness: {conversation?.competitiveness ?? "balanced"}
        </Text>
        {typeof conversation?.currentVDOT === "number" ? (
          <Text style={styles.helperText}>Current VDOT: {conversation.currentVDOT.toFixed(1)}</Text>
        ) : null}
      </Panel>

      <Panel title="Message Coach">
        <TextInput
          style={[styles.input, styles.textArea]}
          value={draft}
          onChangeText={(value) => {
            setDraft(value);
            setError(null);
          }}
          placeholder="Ask about goal changes, schedule constraints, skipped runs, or plan tradeoffs..."
          placeholderTextColor="#7a848c"
          multiline
        />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <PrimaryButton label={sending ? "Sending..." : "Send"} onPress={() => void runSend()} disabled={sending || draft.trim().length === 0} />
      </Panel>

      <Panel title="Conversation">
        {conversation === undefined ? <Text style={styles.helperText}>Loading messages...</Text> : null}
        {conversation?.messages.map((message) => (
          <View
            key={String(message._id)}
            style={[
              styles.chatBubble,
              message.author === "user" ? styles.chatBubbleUser : styles.chatBubbleCoach,
            ]}
          >
            <Text style={styles.chatMeta}>
              {message.author === "user" ? "You" : message.kind === "event" ? "Coach update" : "Coach"} · {formatMessageTime(message.createdAt)}
            </Text>
            <Text style={styles.chatBody}>{message.body}</Text>
          </View>
        ))}
      </Panel>
    </ScrollView>
  );
}
