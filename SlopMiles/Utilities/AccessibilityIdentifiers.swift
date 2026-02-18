import Foundation

enum AccessibilityID {
    // MARK: - Tabs
    enum Tab {
        static let dashboard = "tab_dashboard"
        static let plans = "tab_plans"
        static let coach = "tab_coach"
        static let history = "tab_history"
        static let settings = "tab_settings"
    }

    // MARK: - Onboarding
    enum Onboarding {
        static let backButton = "onboarding_back_button"
        static let getStartedButton = "onboarding_get_started"
    }

    // MARK: - Dashboard
    enum Dashboard {
        static let noPlanView = "dashboard_no_plan"
        static let createPlanButton = "dashboard_create_plan"
        static let currentPlanCard = "dashboard_current_plan"
        static let nextWorkoutCard = "dashboard_next_workout"
    }

    // MARK: - Plans
    enum Plans {
        static let list = "plans_list"
        static let addButton = "plans_add_button"
        static let emptyState = "plans_empty_state"
    }

    // MARK: - Coaching
    enum Coaching {
        static let messageInput = "coaching_message_input"
        static let sendButton = "coaching_send_button"
    }

    // MARK: - Settings
    enum Settings {
        static let profileRow = "settings_profile"
        static let scheduleRow = "settings_schedule"
        static let equipmentRow = "settings_equipment"
    }
}
