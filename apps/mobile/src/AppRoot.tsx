import { useEffect, useState } from "react";
import { ActivityIndicator, Text } from "react-native";
import { useMutation } from "convex/react";
import { type CompetitivenessLevel, type OnboardingStep, type PersonalityPreset } from "@slopmiles/domain";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "./convex";
import { MainTabs } from "./screens/MainTabs";
import { OnboardingFlow } from "./screens/OnboardingFlow";
import { styles } from "./styles";
import type { SessionPayload } from "./types";

const ANONYMOUS_HANDLE = "ios-anonymous-v1";

export default function AppRoot() {
  const bootstrapAnonymous = useMutation(api.users.bootstrapAnonymous);
  const completeStep = useMutation(api.onboarding.completeStep);
  const saveHealthKitAuthorization = useMutation(api.onboarding.saveHealthKitAuthorization);
  const saveProfileBasics = useMutation(api.onboarding.saveProfileBasics);
  const saveRunningSchedule = useMutation(api.onboarding.saveRunningSchedule);
  const saveTrackAccess = useMutation(api.onboarding.saveTrackAccess);
  const saveCompetitiveness = useMutation(api.onboarding.saveCompetitiveness);
  const savePersonality = useMutation(api.onboarding.savePersonality);

  const [session, setSession] = useState<SessionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    const payload = (await bootstrapAnonymous({
      anonymousHandle: ANONYMOUS_HANDLE,
    })) as SessionPayload;
    setSession(payload);
  };

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        setError(null);
        await refresh();
      } catch (err) {
        if (mounted) {
          setError(String(err));
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  const runMutation = async (fn: () => Promise<unknown>) => {
    setSaving(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !session) {
    return (
      <SafeAreaView style={styles.screenCenter}>
        <ActivityIndicator color="#154e72" size="large" />
        <Text style={styles.helperText}>Bootstrapping your coach profile...</Text>
      </SafeAreaView>
    );
  }

  if (session.onboardingState.isComplete) {
    return (
      <MainTabs
        userId={session.user._id}
        userName={session.user.name}
        defaultVolumeMode={session.user.volumePreference}
      />
    );
  }

  return (
    <OnboardingFlow
      session={session}
      saving={saving}
      error={error}
      onCompleteStep={(step: OnboardingStep) =>
        runMutation(async () => {
          await completeStep({
            userId: session.user._id,
            step,
          });
        })
      }
      onSaveHealthKitAuthorization={(authorized) =>
        runMutation(async () => {
          await saveHealthKitAuthorization({
            userId: session.user._id,
            authorized,
          });
        })
      }
      onSaveProfileBasics={(value) =>
        runMutation(async () => {
          await saveProfileBasics({
            userId: session.user._id,
            name: value.name,
            unitPreference: value.unitPreference,
            volumePreference: value.volumePreference,
          });
        })
      }
      onSaveRunningSchedule={(value) =>
        runMutation(async () => {
          await saveRunningSchedule({
            userId: session.user._id,
            preferredRunningDays: value.preferredRunningDays,
            runningDaysPerWeek: value.runningDaysPerWeek,
            preferredLongRunDay: value.preferredLongRunDay ?? undefined,
            preferredQualityDays: value.preferredQualityDays,
          });
        })
      }
      onSaveTrackAccess={(trackAccess) =>
        runMutation(async () => {
          await saveTrackAccess({
            userId: session.user._id,
            trackAccess,
          });
        })
      }
      onSaveCompetitiveness={(level: CompetitivenessLevel) =>
        runMutation(async () => {
          await saveCompetitiveness({
            userId: session.user._id,
            level,
          });
        })
      }
      onSavePersonality={(value: { preset: PersonalityPreset; customDescription?: string }) =>
        runMutation(async () => {
          await savePersonality({
            userId: session.user._id,
            preset: value.preset,
            customDescription: value.customDescription,
          });
        })
      }
    />
  );
}
