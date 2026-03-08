import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { type CompetitivenessLevel, type OnboardingStep, type PersonalityPreset } from "@slopmiles/domain";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "./convex";
import { PrimaryButton, SecondaryButton } from "./components/common";
import {
  requestHealthKitAuthorization,
  seedRecentHealthKitImport,
  type HealthKitPermissionResult,
} from "./healthkit/bridge";
import { MainTabs } from "./screens/MainTabs";
import { OnboardingFlow } from "./screens/OnboardingFlow";
import { styles } from "./styles";
import type { HealthKitSyncResult, SessionPayload } from "./types";

function isSessionPayload(value: unknown): value is SessionPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<SessionPayload>;
  return (
    Boolean(candidate.user) &&
    typeof candidate.user?.name === "string" &&
    typeof candidate.user?.unitPreference === "string" &&
    Boolean(candidate.runningSchedule) &&
    Array.isArray(candidate.runningSchedule?.preferredRunningDays) &&
    Boolean(candidate.onboardingState) &&
    typeof candidate.onboardingState?.currentStep === "string" &&
    typeof candidate.onboardingState?.isComplete === "boolean" &&
    Boolean(candidate.competitiveness) &&
    typeof candidate.competitiveness?.level === "string" &&
    Boolean(candidate.personality) &&
    typeof candidate.personality?.name === "string"
  );
}

export default function AppRoot() {
  const { signOut } = useAuthActions();
  const bootstrapSession = useMutation(api.users.bootstrapSession);
  const resetAppData = useMutation(api.users.resetAppData);
  const updateName = useMutation(api.users.updateName);
  const updateUnitPreference = useMutation(api.users.updateUnitPreference);
  const updateVolumePreference = useMutation(api.users.updateVolumePreference);
  const updateTrackAccess = useMutation(api.users.updateTrackAccess);
  const updateRunningSchedule = useMutation(api.users.updateRunningSchedule);
  const updateCompetitivenessPreference = useMutation(api.users.updateCompetitiveness);
  const updatePersonalityPreference = useMutation(api.users.updatePersonality);
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

  const signOutSafely = async () => {
    try {
      await signOut();
    } catch (signOutError) {
      setError(String(signOutError));
    }
  };

  const refresh = async (): Promise<SessionPayload | null> => {
    const payload = await bootstrapSession({});

    if (!payload) {
      setSession(null);
      await signOutSafely();
      return null;
    }

    if (!isSessionPayload(payload)) {
      throw new Error("Received invalid session payload from backend.");
    }

    setSession(payload);
    return payload;
  };

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        setError(null);
        setLoading(true);
        await refresh();
      } catch (err) {
        if (mounted) {
          setError(String(err));
          setSession(null);
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
      const refreshed = await refresh();
      if (!refreshed) {
        return null;
      }
      return result;
    } catch (err) {
      try {
        const refreshed = await refresh();
        if (!refreshed) {
          return null;
        }
      } catch (refreshError) {
        setError(String(refreshError));
        return null;
      }

      setError(String(err));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const runMutationVoid = async (fn: () => Promise<unknown>): Promise<void> => {
    await runMutation(fn);
  };

  const normalizedRunningSchedule = useMemo(
    () =>
      session
        ? {
            ...session.runningSchedule,
            availabilityWindows: session.runningSchedule.availabilityWindows ?? {},
          }
        : null,
    [session],
  );

  const importHealthKitSeed = async () => {
    const payload = await seedRecentHealthKitImport();
    return seedHealthKitImportWorkouts({
      workouts: payload.workouts,
      restingHeartRate: payload.restingHeartRate,
      inferredMaxHeartRate: payload.inferredMaxHeartRate,
    });
  };

  const resetApp = async () => {
    if (!session) {
      return;
    }

    await resetAppData({});
    try {
      await signOut();
    } catch (error) {
      await refresh();
      throw error;
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.screenCenter}>
        <ActivityIndicator color="#154e72" size="large" />
        <Text style={styles.helperText}>Bootstrapping your coach profile...</Text>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.screenCenter}>
        <View style={{ width: "100%", maxWidth: 360, paddingHorizontal: 20, gap: 12 }}>
          <Text style={styles.heading}>Session unavailable</Text>
          <Text style={styles.helperText}>{error ?? "We could not load your session. Try again or sign in again."}</Text>
          <PrimaryButton
            label="Retry"
            onPress={() => {
              void (async () => {
                setLoading(true);
                setError(null);
                try {
                  await refresh();
                } catch (retryError) {
                  setError(String(retryError));
                } finally {
                  setLoading(false);
                }
              })();
            }}
          />
          <SecondaryButton
            label="Sign out"
            onPress={() => {
              void signOutSafely();
            }}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (session.onboardingState.isComplete) {
    return (
      <MainTabs
        userName={session.user.name}
        unitPreference={session.user.unitPreference}
        defaultVolumeMode={session.user.volumePreference}
        runningSchedule={normalizedRunningSchedule!}
        trackAccess={session.user.trackAccess}
        competitivenessLevel={session.competitiveness.level}
        personality={session.personality}
        healthKitAuthorized={session.user.healthKitAuthorized}
        currentVDOT={session.user.currentVDOT ?? null}
        onResetApp={resetApp}
        onUpdateName={(name) =>
          runMutationVoid(async () => {
            await updateName({
              name,
            });
          })
        }
        onUpdateUnitPreference={(unitPreference) =>
          runMutationVoid(async () => {
            await updateUnitPreference({
              unitPreference,
            });
          })
        }
        onUpdateVolumePreference={(volumePreference) =>
          runMutationVoid(async () => {
            await updateVolumePreference({
              volumePreference,
            });
          })
        }
        onUpdateTrackAccess={(trackAccess) =>
          runMutationVoid(async () => {
            await updateTrackAccess({
              trackAccess,
            });
          })
        }
        onUpdateRunningSchedule={(runningSchedule) =>
          runMutationVoid(async () => {
            await updateRunningSchedule({
              ...runningSchedule,
              preferredLongRunDay: runningSchedule.preferredLongRunDay ?? undefined,
            });
          })
        }
        onUpdateCompetitiveness={(level) =>
          runMutationVoid(async () => {
            await updateCompetitivenessPreference({
              level,
            });
          })
        }
        onUpdatePersonality={(value) =>
          runMutationVoid(async () => {
            await updatePersonalityPreference(value);
          })
        }
        onSyncHealthKit={async () => {
          const permission = await requestHealthKitAuthorization();

          const result = await runMutation(async () => {
            await setHealthKitAuthorizationStatus({
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
              importResult = await importHealthKitSeed();
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
            step,
          });
        })
      }
      onSaveHealthKitAuthorization={(permission: HealthKitPermissionResult) =>
        runMutationVoid(async () => {
          await saveHealthKitAuthorization({
            authorized: permission.authorized,
          });

          if (permission.authorized) {
            try {
              await importHealthKitSeed();
            } catch (error) {
              setError(`HealthKit connected, but initial import failed: ${String(error)}`);
            }
          }
        })
      }
      onSaveProfileBasics={(value) =>
        runMutationVoid(async () => {
          await saveProfileBasics({
            unitPreference: value.unitPreference,
            volumePreference: value.volumePreference,
          });
        })
      }
      onSaveRunningSchedule={(value) =>
        runMutationVoid(async () => {
          await saveRunningSchedule({
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
            trackAccess,
          });
        })
      }
      onSaveVdotFromHistory={(workoutId) =>
        runMutationVoid(async () => {
          await saveVdotFromHistoryWorkout({
            healthKitWorkoutId: workoutId,
          });
        })
      }
      onSaveVdotFromManual={(value) =>
        runMutationVoid(async () => {
          await saveVdotFromManualResult({
            distanceMeters: value.distanceMeters,
            timeSeconds: value.timeSeconds,
          });
        })
      }
      onSaveCompetitiveness={(level: CompetitivenessLevel) =>
        runMutationVoid(async () => {
          await saveCompetitiveness({
            level,
          });
        })
      }
      onSavePersonality={(value: { preset: PersonalityPreset; customDescription?: string }) =>
        runMutationVoid(async () => {
          await savePersonality({
            preset: value.preset,
            customDescription: value.customDescription,
          });
        })
      }
    />
  );
}
