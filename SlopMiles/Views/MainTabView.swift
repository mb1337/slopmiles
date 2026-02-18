import SwiftUI

struct MainTabView: View {
    @Environment(AppState.self) private var appState
    @SceneStorage("selectedTab") private var storedTab: Int = AppState.AppTab.dashboard.rawValue

    var body: some View {
        @Bindable var state = appState
        TabView(selection: $state.selectedTab) {
            Tab("Dashboard", systemImage: "house.fill", value: .dashboard) {
                DashboardView()
            }
            .accessibilityIdentifier(AccessibilityID.Tab.dashboard)
            Tab("Plans", systemImage: "calendar", value: .plans) {
                PlansListView()
            }
            .accessibilityIdentifier(AccessibilityID.Tab.plans)
            Tab("Coach", systemImage: "message.fill", value: .coach) {
                CoachingView()
            }
            .accessibilityIdentifier(AccessibilityID.Tab.coach)
            Tab("History", systemImage: "clock.fill", value: .history) {
                HistoryView()
            }
            .accessibilityIdentifier(AccessibilityID.Tab.history)
            Tab("Settings", systemImage: "gear", value: .settings) {
                SettingsView()
            }
            .accessibilityIdentifier(AccessibilityID.Tab.settings)
        }
        .tint(Theme.accent)
        .onAppear {
            // Restore the persisted tab on launch
            if let restored = AppState.AppTab(rawValue: storedTab) {
                appState.selectedTab = restored
            }
        }
        .onChange(of: appState.selectedTab) { _, newTab in
            // Persist tab changes to scene storage
            storedTab = newTab.rawValue
        }
    }
}

#Preview {
    MainTabView()
        .environment(PreviewData.appState)
        .modelContainer(PreviewData.container)
}
