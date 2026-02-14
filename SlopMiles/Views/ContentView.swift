import SwiftUI
import SwiftData

struct ContentView: View {
    @Environment(AppState.self) private var appState
    @Query private var aiSettings: [AISettings]

    private let keychain = KeychainService()

    /// True only when onboarding was completed AND an API key for the
    /// selected provider exists on this device. CloudKit syncs the
    /// SwiftData flag, but the Keychain is device-local — so a new
    /// device may have `hasCompletedOnboarding == true` with no key.
    private var isFullyOnboarded: Bool {
        guard let settings = aiSettings.first,
              settings.hasCompletedOnboarding else {
            return false
        }
        return keychain.hasKey(settings.provider.keychainKey)
    }

    var body: some View {
        Group {
            if aiSettings.first != nil {
                if isFullyOnboarded {
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
