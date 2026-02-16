import Foundation
import SwiftData

@Observable
@MainActor
final class AppState {
    let keychainService: KeychainService
    let aiService: AIService
    let healthKitService = HealthKitService()
    let locationService = LocationService()
    let workoutKitService = WorkoutKitService()
    let weekGenerationManager = WeekGenerationManager()
    let openRouterModelService = OpenRouterModelService()

    init() {
        let keychain = KeychainService()
        self.keychainService = keychain
        self.aiService = AIService(keychainService: keychain)
    }

    var selectedTab: AppTab = .dashboard

    enum AppTab: Int, CaseIterable {
        case dashboard
        case plans
        case history
        case settings

        var title: String {
            switch self {
            case .dashboard: return "Dashboard"
            case .plans: return "Plans"
            case .history: return "History"
            case .settings: return "Settings"
            }
        }

        var iconName: String {
            switch self {
            case .dashboard: return "house.fill"
            case .plans: return "calendar"
            case .history: return "clock.fill"
            case .settings: return "gear"
            }
        }
    }
}
