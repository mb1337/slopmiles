import { ScrollView, Text } from "react-native";
import { useQuery } from "convex/react";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  ONBOARDING_STEPS,
  type CompetitivenessLevel,
  type OnboardingStep,
  type PersonalityPreset,
  type UnitPreference,
  type VolumeMode,
  type Weekday,
} from "@slopmiles/domain";

import {
  CompetitivenessStep,
  EstablishVdotStep,
  HealthKitStep,
  PersonalityStep,
  ProfileBasicsStep,
  RunningScheduleStep,
  StepCard,
  TrackAccessStep,
} from "../components/onboardingSteps";
import { ScreenHeader } from "../components/common";
import { api, type Id } from "../convex";
import { requestHealthKitAuthorization, type HealthKitPermissionResult } from "../healthkit/bridge";
import { styles } from "../styles";
import type { SessionPayload } from "../types";

export function OnboardingFlow({
  session,
  saving,
  error,
  onCompleteStep,
  onSaveHealthKitAuthorization,
  onSaveProfileBasics,
  onSaveRunningSchedule,
  onSaveTrackAccess,
  onSaveVdotFromHistory,
  onSaveVdotFromManual,
  onSaveCompetitiveness,
  onSavePersonality,
}: {
  session: SessionPayload;
  saving: boolean;
  error: string | null;
  onCompleteStep: (step: OnboardingStep) => Promise<void>;
  onSaveHealthKitAuthorization: (permission: HealthKitPermissionResult) => Promise<void>;
  onSaveProfileBasics: (value: {
    unitPreference: UnitPreference;
    volumePreference: VolumeMode;
  }) => Promise<void>;
  onSaveRunningSchedule: (value: {
    preferredRunningDays: Weekday[];
    runningDaysPerWeek: number;
    preferredLongRunDay: Weekday | null;
    preferredQualityDays: Weekday[];
  }) => Promise<void>;
  onSaveTrackAccess: (trackAccess: boolean) => Promise<void>;
  onSaveVdotFromHistory: (workoutId: Id<"healthKitWorkouts">) => Promise<void>;
  onSaveVdotFromManual: (value: { distanceMeters: number; timeSeconds: number }) => Promise<void>;
  onSaveCompetitiveness: (level: CompetitivenessLevel) => Promise<void>;
  onSavePersonality: (value: {
    preset: PersonalityPreset;
    customDescription?: string;
  }) => Promise<void>;
}) {
  const historyWorkouts = useQuery(
    api.healthkit.listImportedWorkouts,
    session.onboardingState.currentStep === "establishVDOT"
      ? {
          limit: 200,
        }
      : "skip",
  );

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container}>
        <ScreenHeader
          eyebrow="SlopMiles"
          title="Onboarding"
          subtitle={`Step ${ONBOARDING_STEPS.indexOf(session.onboardingState.currentStep) + 1} of ${ONBOARDING_STEPS.length}`}
        />
        <Text style={styles.helperText}>
          Keep each step to one decision, then continue. Completed steps stay saved if you leave and return.
        </Text>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {session.onboardingState.currentStep === "welcome" ? (
          <StepCard
            title="Welcome"
            body="Your AI running coach adapts as you train. Let's capture your baseline settings first."
            actionLabel="Start setup"
            busy={saving}
            onAction={() => onCompleteStep("welcome")}
          />
        ) : null}

        {session.onboardingState.currentStep === "healthKitAuthorization" ? (
          <HealthKitStep
            busy={saving}
            onAuthorize={async () => {
              const permission = await requestHealthKitAuthorization();
              await onSaveHealthKitAuthorization(permission);
            }}
            onSkip={() =>
              onSaveHealthKitAuthorization({
                status: "denied",
                authorized: false,
                reason: "User skipped HealthKit authorization.",
              })
            }
          />
        ) : null}

        {session.onboardingState.currentStep === "profileBasics" ? (
          <ProfileBasicsStep
            defaultUnit={session.user.unitPreference}
            defaultVolumeMode={session.user.volumePreference}
            busy={saving}
            onSubmit={onSaveProfileBasics}
          />
        ) : null}

        {session.onboardingState.currentStep === "runningSchedule" ? (
          <RunningScheduleStep
            defaultDays={session.runningSchedule.preferredRunningDays}
            defaultDaysPerWeek={session.runningSchedule.runningDaysPerWeek}
            defaultLongRunDay={session.runningSchedule.preferredLongRunDay}
            defaultQualityDays={session.runningSchedule.preferredQualityDays}
            busy={saving}
            onSubmit={onSaveRunningSchedule}
          />
        ) : null}

        {session.onboardingState.currentStep === "trackAccess" ? (
          <TrackAccessStep
            defaultTrackAccess={session.user.trackAccess}
            busy={saving}
            onSubmit={onSaveTrackAccess}
          />
        ) : null}

        {session.onboardingState.currentStep === "establishVDOT" ? (
          <EstablishVdotStep
            historyWorkouts={historyWorkouts}
            unitPreference={session.user.unitPreference}
            busy={saving}
            onSubmitFromHistory={onSaveVdotFromHistory}
            onSubmitManual={onSaveVdotFromManual}
            onSkip={() => onCompleteStep("establishVDOT")}
          />
        ) : null}

        {session.onboardingState.currentStep === "competitiveness" ? (
          <CompetitivenessStep
            defaultLevel={session.competitiveness.level}
            busy={saving}
            onSubmit={onSaveCompetitiveness}
          />
        ) : null}

        {session.onboardingState.currentStep === "personality" ? (
          <PersonalityStep
            defaultPersonality={session.personality.name}
            defaultCustomDescription={session.personality.isPreset ? "" : session.personality.description}
            busy={saving}
            onSubmit={onSavePersonality}
          />
        ) : null}

        {session.onboardingState.currentStep === "notifications" ? (
          <StepCard
            title="Notifications"
            body="Push permission prompt will be connected after native notification plumbing lands."
            actionLabel="Finish setup"
            busy={saving}
            onAction={() => onCompleteStep("notifications")}
          />
        ) : null}

        {session.onboardingState.currentStep === "done" ? (
          <StepCard
            title="You're ready"
            body="Onboarding is stored incrementally in Convex and will resume from any incomplete step on relaunch."
            actionLabel="Go to dashboard"
            busy={saving}
            onAction={() => onCompleteStep("done")}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
