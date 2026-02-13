import SwiftUI
import SwiftData

struct ContentView: View {
    @Environment(AppState.self) private var appState
    @Query private var aiSettings: [AISettings]

    var body: some View {
        Group {
            if let settings = aiSettings.first {
                if settings.hasCompletedOnboarding {
                    MainTabView()
                } else {
                    OnboardingView()
                }
            } else {
                // Singleton models are seeded in SlopMilesApp.task;
                // this placeholder shows briefly on first launch.
                ProgressView()
            }
        }
    }
}
