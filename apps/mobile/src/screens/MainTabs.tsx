import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { type UnitPreference, type VolumeMode } from "@slopmiles/domain";
import { SafeAreaView } from "react-native-safe-area-context";

import { CoachScreen } from "./tabs/CoachScreen";
import { DashboardScreen } from "./tabs/DashboardScreen";
import { HistoryScreen } from "./tabs/HistoryScreen";
import { PlanScreen } from "./tabs/PlanScreen";
import { SettingsScreen } from "./tabs/SettingsScreen";
import { styles } from "../styles";
import type { HealthKitSyncResult, Tab } from "../types";

export function MainTabs({
  userName,
  unitPreference,
  defaultVolumeMode,
  healthKitAuthorized,
  currentVDOT,
  onResetApp,
  onUpdateName,
  onUpdateUnitPreference,
  onSyncHealthKit,
}: {
  userName: string;
  unitPreference: UnitPreference;
  defaultVolumeMode: VolumeMode;
  healthKitAuthorized: boolean;
  currentVDOT: number | null;
  onResetApp: () => Promise<void>;
  onUpdateName: (name: string) => Promise<void>;
  onUpdateUnitPreference: (unitPreference: UnitPreference) => Promise<void>;
  onSyncHealthKit: () => Promise<HealthKitSyncResult>;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.tabContent}>
        {activeTab === "dashboard" ? (
          <DashboardScreen
            userName={userName}
            currentVDOT={currentVDOT}
            onCreatePlanPress={() => setActiveTab("plan")}
          />
        ) : null}
        {activeTab === "plan" ? <PlanScreen defaultVolumeMode={defaultVolumeMode} /> : null}
        {activeTab === "history" ? <HistoryScreen unitPreference={unitPreference} /> : null}
        {activeTab === "coach" ? <CoachScreen /> : null}
        {activeTab === "settings" ? (
          <SettingsScreen
            userName={userName}
            unitPreference={unitPreference}
            healthKitAuthorized={healthKitAuthorized}
            onResetApp={onResetApp}
            onUpdateName={onUpdateName}
            onUpdateUnitPreference={onUpdateUnitPreference}
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
