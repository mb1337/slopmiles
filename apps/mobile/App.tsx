import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { ConvexReactClient } from "convex/react";
import { ConvexProvider, useMutation } from "convex/react";
import { anyApi } from "convex/server";
import {
  COMPETITIVENESS_LEVELS,
  ONBOARDING_STEPS,
  PERSONALITY_PRESETS,
  VOLUME_MODES,
  WEEKDAYS,
  type CompetitivenessLevel,
  type OnboardingStep,
  type PersonalityPreset,
  type UnitPreference,
  type VolumeMode,
  type Weekday,
} from "@slopmiles/domain";

declare const process:
  | {
      env?: Record<string, string | undefined>;
    }
  | undefined;

const convexUrl = process?.env?.EXPO_PUBLIC_CONVEX_URL;
const api = anyApi as any;
const ANONYMOUS_HANDLE = "ios-anonymous-v1";

type SessionPayload = {
  user: {
    _id: string;
    name: string;
    unitPreference: UnitPreference;
    volumePreference: VolumeMode;
    trackAccess: boolean;
  };
  runningSchedule: {
    preferredRunningDays: Weekday[];
    runningDaysPerWeek: number;
    preferredLongRunDay: Weekday | null;
    preferredQualityDays: Weekday[];
  };
  onboardingState: {
    currentStep: OnboardingStep;
    isComplete: boolean;
  };
  competitiveness: {
    level: CompetitivenessLevel;
  };
  personality: {
    name: PersonalityPreset;
    description: string;
    isPreset: boolean;
  };
};

type Tab = "dashboard" | "plan" | "history" | "coach" | "settings";

export default function App() {
  const convex = useMemo(() => {
    if (!convexUrl) {
      return null;
    }
    return new ConvexReactClient(convexUrl);
  }, []);

  if (!convex) {
    return <MissingConfigScreen />;
  }

  return (
    <ConvexProvider client={convex}>
      <StatusBar style="dark" />
      <AppRoot />
    </ConvexProvider>
  );
}

function AppRoot() {
  const bootstrapAnonymous = useMutation(api.users.bootstrapAnonymous);
  const completeStep = useMutation(api.onboarding.completeStep);
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
    return <MainTabs userName={session.user.name} />;
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.kicker}>SlopMiles</Text>
        <Text style={styles.heading}>Onboarding</Text>
        <Text style={styles.helperText}>
          Step {ONBOARDING_STEPS.indexOf(session.onboardingState.currentStep) + 1} of {ONBOARDING_STEPS.length}
        </Text>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {session.onboardingState.currentStep === "welcome" ? (
          <StepCard
            title="Welcome"
            body="Your AI running coach adapts as you train. Let's capture your baseline settings first."
            actionLabel="Start setup"
            busy={saving}
            onAction={() =>
              runMutation(async () => {
                await completeStep({
                  userId: session.user._id,
                  step: "welcome",
                });
              })
            }
          />
        ) : null}

        {session.onboardingState.currentStep === "healthKitAuthorization" ? (
          <StepCard
            title="HealthKit"
            body="HealthKit wiring is scaffolded next. For now, continue and we'll complete permissions in the native module pass."
            actionLabel="Continue"
            busy={saving}
            onAction={() =>
              runMutation(async () => {
                await completeStep({
                  userId: session.user._id,
                  step: "healthKitAuthorization",
                });
              })
            }
          />
        ) : null}

        {session.onboardingState.currentStep === "profileBasics" ? (
          <ProfileBasicsStep
            defaultName={session.user.name}
            defaultUnit={session.user.unitPreference}
            defaultVolumeMode={session.user.volumePreference}
            busy={saving}
            onSubmit={(value) =>
              runMutation(async () => {
                await saveProfileBasics({
                  userId: session.user._id,
                  name: value.name,
                  unitPreference: value.unitPreference,
                  volumePreference: value.volumePreference,
                });
              })
            }
          />
        ) : null}

        {session.onboardingState.currentStep === "runningSchedule" ? (
          <RunningScheduleStep
            defaultDays={session.runningSchedule.preferredRunningDays}
            defaultDaysPerWeek={session.runningSchedule.runningDaysPerWeek}
            defaultLongRunDay={session.runningSchedule.preferredLongRunDay}
            defaultQualityDays={session.runningSchedule.preferredQualityDays}
            busy={saving}
            onSubmit={(value) =>
              runMutation(async () => {
                await saveRunningSchedule({
                  userId: session.user._id,
                  preferredRunningDays: value.preferredRunningDays,
                  runningDaysPerWeek: value.runningDaysPerWeek,
                  preferredLongRunDay: value.preferredLongRunDay,
                  preferredQualityDays: value.preferredQualityDays,
                });
              })
            }
          />
        ) : null}

        {session.onboardingState.currentStep === "trackAccess" ? (
          <TrackAccessStep
            defaultTrackAccess={session.user.trackAccess}
            busy={saving}
            onSubmit={(trackAccess) =>
              runMutation(async () => {
                await saveTrackAccess({
                  userId: session.user._id,
                  trackAccess,
                });
              })
            }
          />
        ) : null}

        {session.onboardingState.currentStep === "establishVDOT" ? (
          <StepCard
            title="Establish VDOT"
            body="VDOT estimation and race-result entry are next slices. For now we keep onboarding resumable and move ahead."
            actionLabel="Use conservative paces"
            busy={saving}
            onAction={() =>
              runMutation(async () => {
                await completeStep({
                  userId: session.user._id,
                  step: "establishVDOT",
                });
              })
            }
          />
        ) : null}

        {session.onboardingState.currentStep === "competitiveness" ? (
          <CompetitivenessStep
            defaultLevel={session.competitiveness.level}
            busy={saving}
            onSubmit={(level) =>
              runMutation(async () => {
                await saveCompetitiveness({
                  userId: session.user._id,
                  level,
                });
              })
            }
          />
        ) : null}

        {session.onboardingState.currentStep === "personality" ? (
          <PersonalityStep
            defaultPersonality={session.personality.name}
            defaultCustomDescription={
              session.personality.isPreset ? "" : session.personality.description
            }
            busy={saving}
            onSubmit={(value) =>
              runMutation(async () => {
                await savePersonality({
                  userId: session.user._id,
                  preset: value.preset,
                  customDescription: value.customDescription,
                });
              })
            }
          />
        ) : null}

        {session.onboardingState.currentStep === "notifications" ? (
          <StepCard
            title="Notifications"
            body="Push permission prompt will be connected after native notification plumbing lands."
            actionLabel="Finish setup"
            busy={saving}
            onAction={() =>
              runMutation(async () => {
                await completeStep({
                  userId: session.user._id,
                  step: "notifications",
                });
              })
            }
          />
        ) : null}

        {session.onboardingState.currentStep === "done" ? (
          <StepCard
            title="You're ready"
            body="Onboarding is stored incrementally in Convex and will resume from any incomplete step on relaunch."
            actionLabel="Go to dashboard"
            busy={saving}
            onAction={() =>
              runMutation(async () => {
                await completeStep({
                  userId: session.user._id,
                  step: "done",
                });
              })
            }
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function MainTabs({ userName }: { userName: string }) {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.tabContent}>
        {activeTab === "dashboard" ? <DashboardScreen userName={userName} /> : null}
        {activeTab === "plan" ? <PlanScreen /> : null}
        {activeTab === "history" ? <HistoryScreen /> : null}
        {activeTab === "coach" ? <CoachScreen /> : null}
        {activeTab === "settings" ? <SettingsScreen /> : null}
      </View>
      <View style={styles.tabBar}>
        {[
          ["dashboard", "Dashboard"],
          ["plan", "Plan"],
          ["history", "History"],
          ["coach", "Coach"],
          ["settings", "Settings"],
        ].map(([key, label]) => (
          <Pressable
            key={String(key)}
            style={[styles.tabButton, activeTab === key ? styles.tabButtonActive : null]}
            onPress={() => setActiveTab(key as Tab)}
          >
            <Text style={[styles.tabButtonText, activeTab === key ? styles.tabButtonTextActive : null]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

function DashboardScreen({ userName }: { userName: string }) {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.kicker}>Dashboard</Text>
      <Text style={styles.heading}>Welcome back{userName ? `, ${userName}` : ""}</Text>
      <Panel title="No active plan">
        <Text style={styles.bodyText}>Create your first plan to unlock weekly workouts and coach feedback.</Text>
        <PrimaryButton label="Create Plan" disabled />
      </Panel>
      <Panel title="VDOT badge">
        <Text style={styles.bodyText}>VDOT initialization comes next after HealthKit and race-result ingestion are wired.</Text>
      </Panel>
    </ScrollView>
  );
}

function PlanScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.kicker}>Plan</Text>
      <Text style={styles.heading}>No active plan</Text>
      <Panel title="Plan empty state">
        <Text style={styles.bodyText}>When no plan is active, users can create a plan or review past plans.</Text>
        <PrimaryButton label="Create Plan" disabled />
      </Panel>
    </ScrollView>
  );
}

function HistoryScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.kicker}>History</Text>
      <Text style={styles.heading}>Workout history</Text>
      <Panel title="Always available">
        <Text style={styles.bodyText}>History remains visible even when there is no active plan.</Text>
      </Panel>
    </ScrollView>
  );
}

function CoachScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.kicker}>Coach</Text>
      <Text style={styles.heading}>Coach chat scaffold</Text>
      <Panel title="Available without plan">
        <Text style={styles.bodyText}>Coach conversation remains available and can suggest creating a plan.</Text>
      </Panel>
    </ScrollView>
  );
}

function SettingsScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.kicker}>Settings</Text>
      <Text style={styles.heading}>Core settings scaffold</Text>
      <Panel title="Ready fields">
        <Text style={styles.bodyText}>Profile, schedule, competitiveness, and personality are now persisted in Convex.</Text>
      </Panel>
    </ScrollView>
  );
}

function StepCard({
  title,
  body,
  actionLabel,
  onAction,
  busy,
}: {
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
  busy: boolean;
}) {
  return (
    <Panel title={title}>
      <Text style={styles.bodyText}>{body}</Text>
      <PrimaryButton label={actionLabel} onPress={onAction} disabled={busy} />
    </Panel>
  );
}

function ProfileBasicsStep({
  defaultName,
  defaultUnit,
  defaultVolumeMode,
  onSubmit,
  busy,
}: {
  defaultName: string;
  defaultUnit: UnitPreference;
  defaultVolumeMode: VolumeMode;
  onSubmit: (value: {
    name: string;
    unitPreference: UnitPreference;
    volumePreference: VolumeMode;
  }) => void;
  busy: boolean;
}) {
  const [name, setName] = useState(defaultName);
  const [unitPreference, setUnitPreference] = useState<UnitPreference>(defaultUnit);
  const [volumePreference, setVolumePreference] = useState<VolumeMode>(defaultVolumeMode);

  return (
    <Panel title="Profile Basics">
      <Text style={styles.label}>Name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        placeholder="Runner name"
        placeholderTextColor="#7a848c"
      />
      <Text style={styles.label}>Unit preference</Text>
      <ChoiceRow
        options={["system", "metric", "imperial"]}
        selected={unitPreference}
        onChange={(value) => setUnitPreference(value as UnitPreference)}
      />
      <Text style={styles.label}>Volume mode</Text>
      <ChoiceRow
        options={VOLUME_MODES}
        selected={volumePreference}
        onChange={(value) => setVolumePreference(value as VolumeMode)}
      />
      <PrimaryButton
        label="Save and continue"
        disabled={busy || name.trim().length === 0}
        onPress={() =>
          onSubmit({
            name: name.trim(),
            unitPreference,
            volumePreference,
          })
        }
      />
    </Panel>
  );
}

function RunningScheduleStep({
  defaultDays,
  defaultDaysPerWeek,
  defaultLongRunDay,
  defaultQualityDays,
  onSubmit,
  busy,
}: {
  defaultDays: Weekday[];
  defaultDaysPerWeek: number;
  defaultLongRunDay: Weekday | null;
  defaultQualityDays: Weekday[];
  onSubmit: (value: {
    preferredRunningDays: Weekday[];
    runningDaysPerWeek: number;
    preferredLongRunDay: Weekday | null;
    preferredQualityDays: Weekday[];
  }) => void;
  busy: boolean;
}) {
  const [preferredRunningDays, setPreferredRunningDays] = useState<Weekday[]>(defaultDays);
  const [runningDaysPerWeek, setRunningDaysPerWeek] = useState(defaultDaysPerWeek);
  const [preferredLongRunDay, setPreferredLongRunDay] = useState<Weekday | null>(defaultLongRunDay);
  const [preferredQualityDays, setPreferredQualityDays] = useState<Weekday[]>(defaultQualityDays);

  const toggleDay = (day: Weekday) => {
    setPreferredRunningDays((previous) => {
      if (previous.includes(day)) {
        const next = previous.filter((item) => item !== day);
        if (preferredLongRunDay === day) {
          setPreferredLongRunDay(null);
        }
        setPreferredQualityDays((list) => list.filter((item) => item !== day));
        return next;
      }
      return [...previous, day];
    });
  };

  const toggleQualityDay = (day: Weekday) => {
    if (!preferredRunningDays.includes(day)) {
      return;
    }

    setPreferredQualityDays((previous) => {
      if (previous.includes(day)) {
        return previous.filter((item) => item !== day);
      }
      return [...previous, day];
    });
  };

  const maxDays = preferredRunningDays.length;
  const clampedRunningDays = Math.max(1, Math.min(runningDaysPerWeek, Math.max(1, maxDays)));

  return (
    <Panel title="Running Schedule">
      <Text style={styles.label}>Preferred running days</Text>
      <TagGrid options={WEEKDAYS} selected={preferredRunningDays} onToggle={(day) => toggleDay(day as Weekday)} />

      <Text style={styles.label}>Target days per week</Text>
      <Counter
        value={clampedRunningDays}
        min={1}
        max={Math.max(1, maxDays)}
        onChange={setRunningDaysPerWeek}
      />

      <Text style={styles.label}>Preferred long run day</Text>
      <ChoiceRow
        options={["none", ...preferredRunningDays]}
        selected={preferredLongRunDay ?? "none"}
        onChange={(value) => setPreferredLongRunDay(value === "none" ? null : (value as Weekday))}
      />

      <Text style={styles.label}>Preferred quality days (tap in priority order)</Text>
      <TagGrid
        options={preferredRunningDays}
        selected={preferredQualityDays}
        onToggle={(day) => toggleQualityDay(day as Weekday)}
      />

      <PrimaryButton
        label="Save and continue"
        disabled={busy || preferredRunningDays.length === 0}
        onPress={() =>
          onSubmit({
            preferredRunningDays,
            runningDaysPerWeek: clampedRunningDays,
            preferredLongRunDay,
            preferredQualityDays,
          })
        }
      />
    </Panel>
  );
}

function TrackAccessStep({
  defaultTrackAccess,
  onSubmit,
  busy,
}: {
  defaultTrackAccess: boolean;
  onSubmit: (trackAccess: boolean) => void;
  busy: boolean;
}) {
  const [trackAccess, setTrackAccess] = useState(defaultTrackAccess);

  return (
    <Panel title="Track Access">
      <Text style={styles.bodyText}>Do you have regular access to a running track?</Text>
      <ChoiceRow
        options={["yes", "no"]}
        selected={trackAccess ? "yes" : "no"}
        onChange={(value) => setTrackAccess(value === "yes")}
      />
      <PrimaryButton label="Save and continue" disabled={busy} onPress={() => onSubmit(trackAccess)} />
    </Panel>
  );
}

function CompetitivenessStep({
  defaultLevel,
  onSubmit,
  busy,
}: {
  defaultLevel: CompetitivenessLevel;
  onSubmit: (value: CompetitivenessLevel) => void;
  busy: boolean;
}) {
  const [level, setLevel] = useState<CompetitivenessLevel>(defaultLevel);

  return (
    <Panel title="Competitiveness">
      <Text style={styles.bodyText}>Pick how aggressively your coach should push training load.</Text>
      <ChoiceRow
        options={COMPETITIVENESS_LEVELS}
        selected={level}
        onChange={(value) => setLevel(value as CompetitivenessLevel)}
      />
      <PrimaryButton label="Save and continue" disabled={busy} onPress={() => onSubmit(level)} />
    </Panel>
  );
}

function PersonalityStep({
  defaultPersonality,
  defaultCustomDescription,
  onSubmit,
  busy,
}: {
  defaultPersonality: PersonalityPreset;
  defaultCustomDescription: string;
  onSubmit: (value: {
    preset: PersonalityPreset;
    customDescription?: string;
  }) => void;
  busy: boolean;
}) {
  const [preset, setPreset] = useState<PersonalityPreset>(defaultPersonality);
  const [customDescription, setCustomDescription] = useState(defaultCustomDescription);

  return (
    <Panel title="Personality">
      <Text style={styles.bodyText}>Choose the coaching style and voice.</Text>
      <ChoiceRow
        options={PERSONALITY_PRESETS}
        selected={preset}
        onChange={(value) => setPreset(value as PersonalityPreset)}
      />
      {preset === "custom" ? (
        <>
          <Text style={styles.label}>Custom personality</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={customDescription}
            onChangeText={setCustomDescription}
            multiline
            placeholder="Describe your ideal coach voice"
            placeholderTextColor="#7a848c"
          />
        </>
      ) : null}
      <PrimaryButton
        label="Save and continue"
        disabled={busy || (preset === "custom" && customDescription.trim().length === 0)}
        onPress={() =>
          onSubmit({
            preset,
            customDescription: preset === "custom" ? customDescription.trim() : undefined,
          })
        }
      />
    </Panel>
  );
}

function MissingConfigScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.kicker}>Configuration</Text>
        <Text style={styles.heading}>Convex URL missing</Text>
        <Panel title="Set EXPO_PUBLIC_CONVEX_URL">
          <Text style={styles.bodyText}>
            Create a .env file in the repo root and set EXPO_PUBLIC_CONVEX_URL to your Convex deployment URL.
          </Text>
        </Panel>
      </ScrollView>
    </SafeAreaView>
  );
}

function Panel({ title, children }: { title: string; children: any }) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>{title}</Text>
      <View style={styles.panelBody}>{children}</View>
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.primaryButton, disabled ? styles.primaryButtonDisabled : null]}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function ChoiceRow({
  options,
  selected,
  onChange,
}: {
  options: readonly string[];
  selected: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.tagRow}>
      {options.map((option) => (
        <Pressable
          key={option}
          style={[styles.tag, selected === option ? styles.tagSelected : null]}
          onPress={() => onChange(option)}
        >
          <Text style={[styles.tagText, selected === option ? styles.tagTextSelected : null]}>{option}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function TagGrid({
  options,
  selected,
  onToggle,
}: {
  options: readonly string[];
  selected: readonly string[];
  onToggle: (value: string) => void;
}) {
  return (
    <View style={styles.tagRow}>
      {options.map((option) => {
        const active = selected.includes(option);
        return (
          <Pressable
            key={option}
            style={[styles.tag, active ? styles.tagSelected : null]}
            onPress={() => onToggle(option)}
          >
            <Text style={[styles.tagText, active ? styles.tagTextSelected : null]}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Counter({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.counterRow}>
      <Pressable style={styles.counterButton} onPress={() => onChange(Math.max(min, value - 1))}>
        <Text style={styles.counterButtonText}>-</Text>
      </Pressable>
      <Text style={styles.counterValue}>{value}</Text>
      <Pressable style={styles.counterButton} onPress={() => onChange(Math.min(max, value + 1))}>
        <Text style={styles.counterButtonText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f7f4ed",
  },
  screenCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#f7f4ed",
  },
  container: {
    padding: 20,
    gap: 16,
  },
  kicker: {
    fontSize: 13,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "#4f6a7e",
    fontWeight: "600",
  },
  heading: {
    fontSize: 30,
    lineHeight: 34,
    color: "#17242d",
    fontWeight: "700",
  },
  helperText: {
    color: "#4e606d",
    fontSize: 14,
  },
  errorText: {
    color: "#9b2d20",
    fontSize: 13,
  },
  panel: {
    borderRadius: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d5ddd8",
    overflow: "hidden",
  },
  panelTitle: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#e8efe9",
    color: "#1f2f28",
    fontWeight: "600",
  },
  panelBody: {
    padding: 14,
    gap: 12,
  },
  bodyText: {
    color: "#2f404c",
    fontSize: 15,
    lineHeight: 22,
  },
  label: {
    fontSize: 13,
    color: "#435562",
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ced8de",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fbfcfc",
    color: "#1f2f38",
  },
  textArea: {
    minHeight: 90,
    textAlignVertical: "top",
  },
  primaryButton: {
    borderRadius: 10,
    paddingVertical: 11,
    backgroundColor: "#165177",
    alignItems: "center",
  },
  primaryButtonDisabled: {
    backgroundColor: "#7b97ab",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#c6d2da",
    backgroundColor: "#ffffff",
  },
  tagSelected: {
    borderColor: "#165177",
    backgroundColor: "#e5f0f7",
  },
  tagText: {
    color: "#395061",
    fontSize: 13,
  },
  tagTextSelected: {
    color: "#0f4261",
    fontWeight: "600",
  },
  counterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  counterButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#c5d1d9",
    alignItems: "center",
    justifyContent: "center",
  },
  counterButtonText: {
    fontSize: 18,
    color: "#2a3d4a",
  },
  counterValue: {
    minWidth: 36,
    textAlign: "center",
    fontWeight: "600",
    color: "#1d2c36",
  },
  tabContent: {
    flex: 1,
  },
  tabBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#d6ddd7",
    backgroundColor: "#ffffff",
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  tabButtonActive: {
    backgroundColor: "#e4f0f7",
  },
  tabButtonText: {
    fontSize: 12,
    color: "#526575",
    fontWeight: "500",
  },
  tabButtonTextActive: {
    color: "#134c6e",
    fontWeight: "700",
  },
});
