import { useEffect, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { useMutation, useQuery } from "convex/react";

import type { CoachInboxView } from "@slopmiles/component-contracts";

import { api, type Id } from "../../convex";
import { PlanAssessmentSummary } from "../../components/assessment";
import {
  PrimaryButton,
  ScreenHeader,
  SectionCard,
  SecondaryButton,
  StatusBanner,
} from "../../components/common";
import { styles } from "../../styles";

const COACH_TIME_BUCKET_MS = 15 * 60 * 1000;

function getCoachTimeBucketMs() {
  return Math.floor(Date.now() / COACH_TIME_BUCKET_MS) * COACH_TIME_BUCKET_MS;
}

function formatMessageTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function CoachScreen({
  onOpenPlan,
  onOpenHistory,
  onOpenPastPlan,
}: {
  onOpenPlan: () => void;
  onOpenHistory: () => void;
  onOpenPastPlan: (planId: Id<"trainingPlans">) => void;
}) {
  const [nowBucketMs, setNowBucketMs] = useState(getCoachTimeBucketMs);
  const inbox = useQuery(api.coachInbox.getCoachInboxView, { nowBucketMs }) as CoachInboxView | undefined;
  const sendCoachMessage = useMutation(api.coach.sendCoachMessage);
  const retryPlanAssessment = useMutation(api.coach.retryPlanAssessment);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [retryingAssessment, setRetryingAssessment] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setNowBucketMs(getCoachTimeBucketMs());
    }, 60 * 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    setError(null);
  }, [draft]);

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
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container}>
        <ScreenHeader
          eyebrow="Coach"
          title="Coach inbox"
          subtitle="Inbox-style updates first, conversation next, composer always available."
        />

        {inbox === undefined ? <StatusBanner message="Loading coach context..." /> : null}

        <SectionCard title="Current context" description="This is the context the coach is reasoning from right now.">
          {inbox?.activePlan ? (
            <Text style={styles.bodyText}>
              {inbox.activePlan.goalLabel} · {inbox.activePlan.numberOfWeeks} weeks · peak {Math.round(inbox.activePlan.peakWeekVolume)}{" "}
              {inbox.activePlan.volumeMode === "time" ? "min" : "m"}
            </Text>
          ) : (
            <Text style={styles.bodyText}>No active plan yet. Use chat to pressure-test goals or schedule constraints before you commit.</Text>
          )}
          {inbox?.runningSchedule ? (
            <Text style={styles.helperText}>
              Schedule: {inbox.runningSchedule.runningDaysPerWeek} days on {inbox.runningSchedule.preferredRunningDays.join(", ")}
            </Text>
          ) : null}
          <Text style={styles.helperText}>
            Personality: {inbox?.personality.name ?? "noNonsense"} · Competitiveness: {inbox?.competitiveness ?? "balanced"}
          </Text>
          {typeof inbox?.currentVDOT === "number" ? <Text style={styles.helperText}>Current VDOT: {inbox.currentVDOT.toFixed(1)}</Text> : null}
        </SectionCard>

        <SectionCard title="Suggested prompts" description="Tap one to seed the composer with a useful ask.">
          <View style={styles.tagRow}>
            {inbox?.suggestedPrompts.map((prompt) => (
              <SecondaryButton key={prompt} label={prompt} onPress={() => setDraft(prompt)} />
            ))}
          </View>
        </SectionCard>

        {inbox?.latestAssessment ? (
          <SectionCard
            title={`${inbox.latestAssessment.planLabel} assessment`}
            description={inbox.latestAssessment.planStatus}
          >
            <PlanAssessmentSummary
              state={inbox.latestAssessment.state}
              retrying={retryingAssessment}
              onRetry={(requestId) => {
                void (async () => {
                  setRetryingAssessment(true);
                  try {
                    await retryPlanAssessment({ requestId: requestId as Id<"aiRequests"> });
                  } finally {
                    setRetryingAssessment(false);
                  }
                })();
              }}
            />
            <SecondaryButton
              label="Open block detail"
              onPress={() => onOpenPastPlan(inbox.latestAssessment!.planId as Id<"trainingPlans">)}
            />
          </SectionCard>
        ) : null}

        <SectionCard title="Messages" description="System updates can deep-link back to the relevant part of the app.">
          {inbox?.messages.map((message) => (
            <View
              key={message._id}
              style={[
                styles.chatBubble,
                message.author === "user" ? styles.chatBubbleUser : styles.chatBubbleCoach,
              ]}
            >
              <Text style={styles.chatMeta}>
                {message.author === "user" ? "You" : message.kind === "event" ? "Coach update" : "Coach"} · {formatMessageTime(message.createdAt)}
              </Text>
              <Text style={styles.chatBody}>{message.body}</Text>
              {message.cta ? (
                <SecondaryButton
                  label={message.cta.label}
                  onPress={() => {
                    if (message.cta?.tab === "plan") {
                      onOpenPlan();
                    } else if (message.cta?.tab === "history") {
                      onOpenHistory();
                    }
                  }}
                />
              ) : null}
            </View>
          ))}
        </SectionCard>
      </ScrollView>

      <View style={[styles.sectionCard, { margin: 16, marginTop: 0 }]}>
        <View style={styles.sectionCardBody}>
          <Text style={styles.sectionCardTitle}>Message coach</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={draft}
            onChangeText={setDraft}
            placeholder="Ask about goal changes, schedule constraints, missed runs, or how to adjust the week..."
            placeholderTextColor="#7a848c"
            multiline
          />
          {error ? <StatusBanner tone="error" message={error} /> : null}
          <PrimaryButton label={sending ? "Sending..." : "Send"} onPress={() => void runSend()} disabled={sending || draft.trim().length === 0} />
        </View>
      </View>
    </View>
  );
}
