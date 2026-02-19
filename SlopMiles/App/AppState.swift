import Foundation
import SwiftData
import SwiftUI

@Observable
@MainActor
final class AppState {
    let keychainService: KeychainService
    let aiService: AIService
    let coachingService: CoachingService
    let healthKitService = HealthKitService()
    let locationService = LocationService()
    let workoutKitService = WorkoutKitService()
    let calendarService = CalendarService()
    let weekGenerationManager = WeekGenerationManager()
    let planGenerationManager = PlanGenerationManager()
    let openRouterModelService = OpenRouterModelService()

    init() {
        let keychain = KeychainService()
        self.keychainService = keychain
        self.aiService = AIService(keychainService: keychain)
        self.coachingService = CoachingService(keychainService: keychain)
    }

    var selectedTab: AppTab = .dashboard
    var plansNavigationPath = NavigationPath()

    enum AppTab: Int, CaseIterable {
        case dashboard
        case plans
        case coach
        case history
        case settings

        var title: String {
            switch self {
            case .dashboard: return "Dashboard"
            case .plans: return "Plans"
            case .coach: return "Coach"
            case .history: return "History"
            case .settings: return "Settings"
            }
        }

        var iconName: String {
            switch self {
            case .dashboard: return "house.fill"
            case .plans: return "calendar"
            case .coach: return "message.fill"
            case .history: return "clock.fill"
            case .settings: return "gear"
            }
        }
    }
}
