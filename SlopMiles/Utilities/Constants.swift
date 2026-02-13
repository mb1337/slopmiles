import Foundation

enum Constants {
    enum RaceDistances {
        static let fiveK: Double = 5000
        static let tenK: Double = 10000
        static let halfMarathon: Double = 21097.5
        static let marathon: Double = 42195

        static let all: [(name: String, meters: Double)] = [
            ("5K", fiveK),
            ("10K", tenK),
            ("Half Marathon", halfMarathon),
            ("Marathon", marathon),
        ]
    }

    enum Keychain {
        static let anthropicAPIKey = "anthropic_api_key"
        static let openAIAPIKey = "openai_api_key"
    }

    static let kmPerMile = 1.60934

    enum Defaults {
        static let maxConversationRounds = 10
        static let maxTokens = 8192
        static let apiTimeout: TimeInterval = 120
    }
}
