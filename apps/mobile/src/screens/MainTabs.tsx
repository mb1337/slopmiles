import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  type CompetitivenessLevel,
  type Personality,
  type RunningSchedule,
  type UnitPreference,
  type VolumeMode,
} from "@slopmiles/domain";
import { SafeAreaView } from "react-native-safe-area-context";

import { CoachScreen } from "./tabs/CoachScreen";
import { HistoryScreen } from "./tabs/HistoryScreen";
import { PlanScreen } from "./tabs/PlanScreen";
import { SettingsScreen } from "./tabs/SettingsScreen";
import { DashboardScreen } from "./tabs/TodayScreen";
import { styles } from "../styles";
import type { HealthKitSyncResult, HistoryRoute, PlanRoute, Tab } from "../types";

export function MainTabs({
  userName,
  unitPreference,
  defaultVolumeMode,
  runningSchedule,
  trackAccess,
  competitivenessLevel,
  personality,
  healthKitAuthorized,
  backgroundSyncEnabled,
  backgroundSyncReason,
  currentVDOT,
  onResetApp,
  onUpdateName,
  onUpdateUnitPreference,
  onUpdateVolumePreference,
  onUpdateTrackAccess,
  onUpdateRunningSchedule,
  onUpdateCompetitiveness,
  onUpdatePersonality,
  onSyncHealthKit,
}: {
  userName: string;
  unitPreference: UnitPreference;
  defaultVolumeMode: VolumeMode;
  runningSchedule: RunningSchedule;
  trackAccess: boolean;
  competitivenessLevel: CompetitivenessLevel;
  personality: Personality;
  healthKitAuthorized: boolean;
  backgroundSyncEnabled: boolean;
  backgroundSyncReason?: string;
  currentVDOT: number | null;
  onResetApp: () => Promise<void>;
  onUpdateName: (name: string) => Promise<void>;
  onUpdateUnitPreference: (unitPreference: UnitPreference) => Promise<void>;
  onUpdateVolumePreference: (volumePreference: VolumeMode) => Promise<void>;
  onUpdateTrackAccess: (trackAccess: boolean) => Promise<void>;
  onUpdateRunningSchedule: (runningSchedule: RunningSchedule) => Promise<void>;
  onUpdateCompetitiveness: (level: CompetitivenessLevel) => Promise<void>;
  onUpdatePersonality: (value: { preset: Personality["name"]; customDescription?: string }) => Promise<void>;
  onSyncHealthKit: () => Promise<HealthKitSyncResult>;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [planRoute, setPlanRoute] = useState<PlanRoute>({ screen: "overview" });
  const [historyRoute, setHistoryRoute] = useState<HistoryRoute>({ screen: "feed" });

  const openPlan = (route: PlanRoute) => {
    setPlanRoute(route);
    setActiveTab("plan");
  };

  const openHistory = (route: HistoryRoute) => {
    setHistoryRoute(route);
    setActiveTab("history");
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.tabContent}>
        {activeTab === "dashboard" ? (
          <DashboardScreen
            userName={userName}
            unitPreference={unitPreference}
            onOpenCreatePlan={() => openPlan({ screen: "create" })}
            onOpenPlanOverview={() => openPlan({ screen: "overview" })}
            onOpenWeek={(weekNumber) => openPlan({ screen: "week", weekNumber })}
            onOpenWorkout={(workoutId, weekNumber) => openPlan({ screen: "workout", workoutId, weekNumber })}
            onOpenPastPlan={(planId) => openPlan({ screen: "pastPlan", planId })}
            onOpenHistoryDetail={(healthKitWorkoutId) => openHistory({ screen: "detail", healthKitWorkoutId })}
            onOpenCoach={() => setActiveTab("coach")}
          />
        ) : null}
        {activeTab === "plan" ? (
          <PlanScreen
            defaultVolumeMode={defaultVolumeMode}
            unitPreference={unitPreference}
            route={planRoute}
            onRouteChange={setPlanRoute}
          />
        ) : null}
        {activeTab === "history" ? (
          <HistoryScreen unitPreference={unitPreference} route={historyRoute} onRouteChange={setHistoryRoute} />
        ) : null}
        {activeTab === "coach" ? (
          <CoachScreen
            onOpenPlan={() => openPlan({ screen: "overview" })}
            onOpenHistory={() => openHistory({ screen: "feed" })}
            onOpenPastPlan={(planId) => openPlan({ screen: "pastPlan", planId })}
          />
        ) : null}
        {activeTab === "settings" ? (
          <SettingsScreen
            userName={userName}
            unitPreference={unitPreference}
            volumePreference={defaultVolumeMode}
            runningSchedule={runningSchedule}
            trackAccess={trackAccess}
            competitivenessLevel={competitivenessLevel}
            personality={personality}
            healthKitAuthorized={healthKitAuthorized}
            backgroundSyncEnabled={backgroundSyncEnabled}
            backgroundSyncReason={backgroundSyncReason}
            onResetApp={onResetApp}
            onUpdateName={onUpdateName}
            onUpdateUnitPreference={onUpdateUnitPreference}
            onUpdateVolumePreference={onUpdateVolumePreference}
            onUpdateTrackAccess={onUpdateTrackAccess}
            onUpdateRunningSchedule={onUpdateRunningSchedule}
            onUpdateCompetitiveness={onUpdateCompetitiveness}
            onUpdatePersonality={onUpdatePersonality}
            onSyncHealthKit={onSyncHealthKit}
          />
        ) : null}
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
