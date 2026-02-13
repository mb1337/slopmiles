import SwiftUI

struct MainTabView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        @Bindable var state = appState
        TabView(selection: $state.selectedTab) {
            Tab("Dashboard", systemImage: "house.fill", value: .dashboard) {
                DashboardView()
            }
            Tab("Plans", systemImage: "calendar", value: .plans) {
                PlansListView()
            }
            Tab("History", systemImage: "clock.fill", value: .history) {
                HistoryView()
            }
            Tab("Settings", systemImage: "gear", value: .settings) {
                SettingsView()
            }
        }
    }
}
