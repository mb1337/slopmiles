import { ScrollView, Text, View } from "react-native";
import { useQuery } from "convex/react";
import { projectedRaceTime, type UnitPreference, type VolumeMode } from "@slopmiles/domain";

import { api, type Id } from "../../convex";
import {
  EmptyStateCard,
  MetricGrid,
  MetricStat,
  PrimaryButton,
  ScreenHeader,
  SectionCard,
  SecondaryButton,
  StatusBanner,
} from "../../components/common";
import { styles } from "../../styles";
import { formatDistanceForDisplay } from "../../units";

function formatRaceTime(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainder = rounded % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
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

function formatAbsoluteVolume(volumeMode: VolumeMode, absoluteVolume: number, unitPreference: UnitPreference) {
  if (volumeMode === "time") {
    const minutes = Math.round(absoluteVolume / 60);
    return `${minutes} min`;
  }

  return formatDistanceForDisplay(absoluteVolume, unitPreference);
}

export function TodayScreen({
  userName,
  unitPreference,
  onOpenCreatePlan,
  onOpenPlanOverview,
  onOpenWeek,
  onOpenWorkout,
  onOpenHistoryDetail,
  onOpenCoach,
}: {
  userName: string;
  unitPreference: UnitPreference;
  onOpenCreatePlan: () => void;
  onOpenPlanOverview: () => void;
  onOpenWeek: (weekNumber: number) => void;
  onOpenWorkout: (workoutId: Id<"workouts">, weekNumber: number) => void;
  onOpenHistoryDetail: (healthKitWorkoutId: Id<"healthKitWorkouts">) => void;
  onOpenCoach: () => void;
}) {
  const summary = useQuery(api.mobileUx.getHomeSummary, {});

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader
        eyebrow="Today"
        title={`Ready to train${userName ? `, ${userName}` : ""}`}
        subtitle="Open the next decision quickly: create a plan, generate the week, check in, or review data."
      />

      {summary === undefined ? <StatusBanner message="Loading today's training snapshot..." /> : null}

      {summary?.activePlan === null ? (
        <EmptyStateCard
          title="No active plan"
          body="Create a plan first, then Today becomes your home for the next workout, current week progress, and coach actions."
          actionLabel="Create plan"
          onAction={onOpenCreatePlan}
        />
      ) : null}

      {summary?.activePlan ? (
        <>
          <SectionCard title="Today focus" description={`${summary.activePlan.label} · ${summary.activePlan.numberOfWeeks} weeks`}>
            {summary.nextWorkout ? (
              <>
                <Text style={styles.workoutTitle}>
                  {formatDateKey(summary.nextWorkout.scheduledDateKey)} · {formatWorkoutType(summary.nextWorkout.type)}
                </Text>
                <Text style={styles.bodyText}>
                  {formatAbsoluteVolume(summary.activePlan.volumeMode, summary.nextWorkout.absoluteVolume, unitPreference)} ·{" "}
                  {Math.round(summary.nextWorkout.volumePercent * 100)}% of peak · {summary.nextWorkout.venue}
                </Text>
                {summary.nextWorkout.weekNumber ? (
                  <PrimaryButton
                    label="Open workout"
                    onPress={() => onOpenWorkout(summary.nextWorkout!._id, summary.nextWorkout!.weekNumber!)}
                  />
                ) : null}
              </>
            ) : (
              <Text style={styles.bodyText}>No upcoming workout is queued right now. Open the plan to review the week.</Text>
            )}
            <SecondaryButton label="Open plan" onPress={onOpenPlanOverview} />
          </SectionCard>

          {summary.weekProgress ? (
            <SectionCard title={`Week ${summary.weekProgress.weekNumber}`} description={summary.weekProgress.emphasis || "Current week"}>
              <MetricGrid>
                <MetricStat
                  label="Completed"
                  value={`${summary.weekProgress.completedWorkouts}/${summary.weekProgress.totalWorkouts}`}
                />
                <MetricStat
                  label="Target"
                  value={formatAbsoluteVolume(summary.activePlan.volumeMode, summary.weekProgress.targetVolumeAbsolute, unitPreference)}
                  hint={`${Math.round(summary.weekProgress.targetVolumePercent * 100)}% of peak`}
                />
              </MetricGrid>
              <SecondaryButton label="Open current week" onPress={() => onOpenWeek(summary.weekProgress!.weekNumber)} />
            </SectionCard>
          ) : null}
        </>
      ) : null}

      <SectionCard title="Pending actions" description="Only actions that move training forward show up here.">
        {summary?.pendingActions?.map((action) => (
          <View key={`${action.kind}-${action.label}`} style={styles.subtleBlock}>
            <Text style={styles.sectionCardTitle}>{action.label}</Text>
            <Text style={styles.helperText}>{action.description}</Text>
            {action.kind === "createPlan" ? <PrimaryButton label="Create plan" onPress={onOpenCreatePlan} /> : null}
            {action.kind === "activateDraft" ? <PrimaryButton label="Review draft" onPress={onOpenPlanOverview} /> : null}
            {action.kind === "generateWeek" && typeof action.weekNumber === "number" ? (
              <PrimaryButton label={`Open week ${action.weekNumber}`} onPress={() => onOpenWeek(action.weekNumber!)} />
            ) : null}
            {action.kind === "submitCheckIn" && action.workoutId && typeof action.weekNumber === "number" ? (
              <PrimaryButton
                label="Open check-in"
                onPress={() => onOpenWorkout(action.workoutId as Id<"workouts">, action.weekNumber!)}
              />
            ) : null}
            {action.kind === "reviewHistory" && action.healthKitWorkoutId ? (
              <PrimaryButton
                label="Review run"
                onPress={() => onOpenHistoryDetail(action.healthKitWorkoutId as Id<"healthKitWorkouts">)}
              />
            ) : null}
            {action.kind === "messageCoach" ? <PrimaryButton label="Message coach" onPress={onOpenCoach} /> : null}
          </View>
        ))}
      </SectionCard>

      <SectionCard title="Coach latest" description="The most recent coach note or system update.">
        {summary?.latestCoachMessage ? (
          <>
            <Text style={styles.bodyText}>{summary.latestCoachMessage.body}</Text>
            <SecondaryButton label="Open coach inbox" onPress={onOpenCoach} />
          </>
        ) : (
          <Text style={styles.bodyText}>Coach updates will appear here once you create a plan or start a conversation.</Text>
        )}
      </SectionCard>

      <SectionCard title="VDOT snapshot" description="Use this to sanity-check target fitness and projected race range.">
        {typeof summary?.currentVDOT === "number" ? (
          <MetricGrid>
            <MetricStat label="VDOT" value={summary.currentVDOT.toFixed(1)} />
            <MetricStat label="5K" value={formatRaceTime(projectedRaceTime(summary.currentVDOT, 5000))} />
            <MetricStat label="10K" value={formatRaceTime(projectedRaceTime(summary.currentVDOT, 10000))} />
            <MetricStat label="Half" value={formatRaceTime(projectedRaceTime(summary.currentVDOT, 21097.5))} />
          </MetricGrid>
        ) : (
          <Text style={styles.bodyText}>No VDOT is established yet. Complete onboarding or import enough history to set paces.</Text>
        )}
      </SectionCard>

      {summary?.pastPlan ? (
        <SectionCard title="Previous block" description={summary.pastPlan.status}>
          <Text style={styles.bodyText}>{summary.pastPlan.label}</Text>
          <Text style={styles.helperText}>
            Last updated {new Date(summary.pastPlan.createdAt).toLocaleDateString()}
          </Text>
          <SecondaryButton label="Open plan history" onPress={onOpenPlanOverview} />
        </SectionCard>
      ) : null}
    </ScrollView>
  );
}
