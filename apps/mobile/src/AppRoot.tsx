import { useEffect, useState } from "react";
import { ActivityIndicator, Text } from "react-native";
import { useMutation } from "convex/react";
import { type CompetitivenessLevel, type OnboardingStep, type PersonalityPreset } from "@slopmiles/domain";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "./convex";
import {
  requestHealthKitAuthorization,
  seedRecentHealthKitImport,
  type HealthKitPermissionResult,
} from "./healthkit/bridge";
import { MainTabs } from "./screens/MainTabs";
import { OnboardingFlow } from "./screens/OnboardingFlow";
import { styles } from "./styles";
import type { HealthKitSyncResult, SessionPayload } from "./types";

const ANONYMOUS_HANDLE = "ios-anonymous-v1";

export default function AppRoot() {
  const bootstrapAnonymous = useMutation(api.users.bootstrapAnonymous);
  const resetAppData = useMutation(api.users.resetAppData);
  const setHealthKitAuthorizationStatus = useMutation(api.healthkit.setAuthorizationStatus);
  const seedHealthKitImportWorkouts = useMutation(api.healthkit.seedImportWorkouts);
  const completeStep = useMutation(api.onboarding.completeStep);
  const saveHealthKitAuthorization = useMutation(api.onboarding.saveHealthKitAuthorization);
  const saveProfileBasics = useMutation(api.onboarding.saveProfileBasics);
  const saveRunningSchedule = useMutation(api.onboarding.saveRunningSchedule);
  const saveTrackAccess = useMutation(api.onboarding.saveTrackAccess);
  const saveVdotFromHistoryWorkout = useMutation(api.onboarding.saveVdotFromHistoryWorkout);
  const saveVdotFromManualResult = useMutation(api.onboarding.saveVdotFromManualResult);
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

  const runMutation = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    setSaving(true);
    setError(null);
    try {
      const result = await fn();
      await refresh();
      return result;
    } catch (err) {
      setError(String(err));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const runMutationVoid = async (fn: () => Promise<unknown>): Promise<void> => {
    await runMutation(fn);
  };

  const importHealthKitSeed = async (userId: SessionPayload["user"]["_id"]) => {
    const payload = await seedRecentHealthKitImport();
    return seedHealthKitImportWorkouts({
      userId,
      workouts: payload.workouts,
      restingHeartRate: payload.restingHeartRate,
      inferredMaxHeartRate: payload.inferredMaxHeartRate,
    });
  };

  const resetApp = async () => {
    if (!session) {
      return;
    }

    await resetAppData({
      userId: session.user._id,
    });
    await refresh();
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
        healthKitAuthorized={session.user.healthKitAuthorized}
        currentVDOT={session.user.currentVDOT ?? null}
        onResetApp={resetApp}
        onSyncHealthKit={async () => {
          const permission = await requestHealthKitAuthorization();

          const result = await runMutation(async () => {
            await setHealthKitAuthorizationStatus({
              userId: session.user._id,
              authorized: permission.authorized,
            });

            if (!permission.authorized) {
              return {
                status: permission.status,
                authorized: false,
                processedCount: 0,
                insertedCount: 0,
                updatedCount: 0,
                reason: permission.reason,
              } satisfies HealthKitSyncResult;
            }

            let importResult: { processedCount: number; insertedCount: number; updatedCount: number } | null = null;
            let importError: string | undefined;
            try {
              importResult = await importHealthKitSeed(session.user._id);
            } catch (error) {
              importError = String(error);
            }

            return {
              status: permission.status,
              authorized: true,
              processedCount: importResult?.processedCount ?? 0,
              insertedCount: importResult?.insertedCount ?? 0,
              updatedCount: importResult?.updatedCount ?? 0,
              reason: importError,
            } satisfies HealthKitSyncResult;
          });

          return (
            result ?? {
              status: permission.status,
              authorized: permission.authorized,
              processedCount: 0,
              insertedCount: 0,
              updatedCount: 0,
              reason: permission.reason,
            }
          );
        }}
      />
    );
  }

  return (
    <OnboardingFlow
      session={session}
      saving={saving}
      error={error}
      onCompleteStep={(step: OnboardingStep) =>
        runMutationVoid(async () => {
          await completeStep({
            userId: session.user._id,
            step,
          });
        })
      }
      onSaveHealthKitAuthorization={(permission: HealthKitPermissionResult) =>
        runMutationVoid(async () => {
          await saveHealthKitAuthorization({
            userId: session.user._id,
            authorized: permission.authorized,
          });

          if (permission.authorized) {
            try {
              await importHealthKitSeed(session.user._id);
            } catch (error) {
              setError(`HealthKit connected, but initial import failed: ${String(error)}`);
            }
          }
        })
      }
      onSaveProfileBasics={(value) =>
        runMutationVoid(async () => {
          await saveProfileBasics({
            userId: session.user._id,
            name: value.name,
            unitPreference: value.unitPreference,
            volumePreference: value.volumePreference,
          });
        })
      }
      onSaveRunningSchedule={(value) =>
        runMutationVoid(async () => {
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
        runMutationVoid(async () => {
          await saveTrackAccess({
            userId: session.user._id,
            trackAccess,
          });
        })
      }
      onSaveVdotFromHistory={(workoutId) =>
        runMutationVoid(async () => {
          await saveVdotFromHistoryWorkout({
            userId: session.user._id,
            healthKitWorkoutId: workoutId,
          });
        })
      }
      onSaveVdotFromManual={(value) =>
        runMutationVoid(async () => {
          await saveVdotFromManualResult({
            userId: session.user._id,
            distanceMeters: value.distanceMeters,
            timeSeconds: value.timeSeconds,
          });
        })
      }
      onSaveCompetitiveness={(level: CompetitivenessLevel) =>
        runMutationVoid(async () => {
          await saveCompetitiveness({
            userId: session.user._id,
            level,
          });
        })
      }
      onSavePersonality={(value: { preset: PersonalityPreset; customDescription?: string }) =>
        runMutationVoid(async () => {
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
