import SwiftUI
import SwiftData

struct ContentView: View {
    @Environment(AppState.self) private var appState
    @Query private var aiSettings: [AISettings]
    @Environment(\.modelContext) private var modelContext

    private var settings: AISettings {
        if let existing = aiSettings.first {
            return existing
        }
        let newSettings = AISettings()
        modelContext.insert(newSettings)
        return newSettings
    }

    var body: some View {
        Group {
            if settings.hasCompletedOnboarding {
                MainTabView()
            } else {
                OnboardingView()
            }
        }
    }
}
