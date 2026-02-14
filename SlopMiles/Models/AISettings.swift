import Foundation
import SwiftData

enum AIProviderType: String, Codable, CaseIterable {
    case anthropic
    case openai
    case openRouter

    var displayName: String {
        switch self {
        case .anthropic: return "Anthropic"
        case .openai: return "OpenAI"
        case .openRouter: return "OpenRouter"
        }
    }

    var defaultModel: String {
        switch self {
        case .anthropic: return "claude-sonnet-4-5-20250929"
        case .openai: return "gpt-4o"
        case .openRouter: return "anthropic/claude-sonnet-4-5"
        }
    }

    var keychainKey: String {
        switch self {
        case .anthropic: return Constants.Keychain.anthropicAPIKey
        case .openai: return Constants.Keychain.openAIAPIKey
        case .openRouter: return Constants.Keychain.openRouterAPIKey
        }
    }

    // TODO: Update model IDs periodically as new versions are released.
    var availableModels: [String] {
        switch self {
        case .anthropic: return ["claude-sonnet-4-5-20250929", "claude-haiku-4-5-20251001"]
        case .openai: return ["gpt-4o", "gpt-4o-mini"]
        case .openRouter: return [
            "anthropic/claude-sonnet-4-5",
            "anthropic/claude-haiku-4-5",
            "openai/gpt-4o",
            "openai/gpt-4o-mini",
            "google/gemini-2.5-pro",
            "google/gemini-2.5-flash",
        ]
        }
    }
}

@Model
final class AISettings {
    var id: UUID = UUID()
    var providerRaw: String = AIProviderType.anthropic.rawValue
    var anthropicModel: String = AIProviderType.anthropic.defaultModel
    var openAIModel: String = AIProviderType.openai.defaultModel
    var openRouterModel: String = AIProviderType.openRouter.defaultModel
    var hasCompletedOnboarding: Bool = false

    var provider: AIProviderType {
        get { AIProviderType(rawValue: providerRaw) ?? .anthropic }
        set { providerRaw = newValue.rawValue }
    }

    var selectedModel: String {
        switch provider {
        case .anthropic: return anthropicModel
        case .openai: return openAIModel
        case .openRouter: return openRouterModel
        }
    }

    init() {}
}
