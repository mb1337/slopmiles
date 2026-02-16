import Testing
import Foundation
@testable import SlopMiles

@Suite("AISettings Model Tests")
struct AISettingsTests {
    // MARK: - AIProviderType properties

    @Test("OpenRouter displayName")
    func openRouterDisplayName() {
        #expect(AIProviderType.openRouter.displayName == "OpenRouter")
    }

    @Test("OpenRouter defaultModel")
    func openRouterDefaultModel() {
        #expect(AIProviderType.openRouter.defaultModel == "anthropic/claude-sonnet-4-5")
    }

    @Test("OpenRouter fallbackModels contains expected models")
    func openRouterFallbackModels() {
        let models = AIProviderType.openRouter.fallbackModels
        #expect(models.contains("anthropic/claude-sonnet-4-5"))
        #expect(models.contains("openai/gpt-4o"))
        #expect(models.contains("google/gemini-2.5-pro"))
        #expect(models.count == 6)
    }

    @Test("keychainKey returns correct key for each provider", arguments: AIProviderType.allCases)
    func keychainKeyIsNonEmpty(provider: AIProviderType) {
        #expect(!provider.keychainKey.isEmpty)
    }

    @Test("OpenRouter keychainKey")
    func openRouterKeychainKey() {
        #expect(AIProviderType.openRouter.keychainKey == "openrouter_api_key")
    }

    // MARK: - AISettings selectedModel

    @Test("selectedModel returns openRouterModel for .openRouter")
    func selectedModelOpenRouter() {
        let settings = AISettings()
        settings.provider = .openRouter
        settings.openRouterModel = "google/gemini-2.5-flash"
        #expect(settings.selectedModel == "google/gemini-2.5-flash")
    }

    @Test("selectedModel returns anthropicModel for .anthropic")
    func selectedModelAnthropic() {
        let settings = AISettings()
        settings.provider = .anthropic
        #expect(settings.selectedModel == settings.anthropicModel)
    }

    @Test("selectedModel returns openAIModel for .openai")
    func selectedModelOpenAI() {
        let settings = AISettings()
        settings.provider = .openai
        #expect(settings.selectedModel == settings.openAIModel)
    }

    @Test("openRouterModel defaults to provider defaultModel")
    func openRouterModelDefault() {
        let settings = AISettings()
        #expect(settings.openRouterModel == AIProviderType.openRouter.defaultModel)
    }
}
