import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { type VolumeMode } from "@slopmiles/domain";
import { SafeAreaView } from "react-native-safe-area-context";

import { type Id } from "../convex";
import { CoachScreen } from "./tabs/CoachScreen";
import { DashboardScreen } from "./tabs/DashboardScreen";
import { HistoryScreen } from "./tabs/HistoryScreen";
import { PlanScreen } from "./tabs/PlanScreen";
import { SettingsScreen } from "./tabs/SettingsScreen";
import { styles } from "../styles";
import type { HealthKitSyncResult, Tab } from "../types";

export function MainTabs({
  userId,
  userName,
  defaultVolumeMode,
  healthKitAuthorized,
  onResetApp,
  onSyncHealthKit,
}: {
  userId: Id<"users">;
  userName: string;
  defaultVolumeMode: VolumeMode;
  healthKitAuthorized: boolean;
  onResetApp: () => Promise<void>;
  onSyncHealthKit: () => Promise<HealthKitSyncResult>;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.tabContent}>
        {activeTab === "dashboard" ? (
          <DashboardScreen userId={userId} userName={userName} onCreatePlanPress={() => setActiveTab("plan")} />
        ) : null}
        {activeTab === "plan" ? <PlanScreen userId={userId} defaultVolumeMode={defaultVolumeMode} /> : null}
        {activeTab === "history" ? <HistoryScreen userId={userId} /> : null}
        {activeTab === "coach" ? <CoachScreen /> : null}
        {activeTab === "settings" ? (
          <SettingsScreen
            healthKitAuthorized={healthKitAuthorized}
            onResetApp={onResetApp}
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
