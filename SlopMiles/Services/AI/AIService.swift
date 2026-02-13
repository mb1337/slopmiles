import Foundation

enum GenerationStatus: Sendable {
    case starting
    case sendingToAI
    case executingTool(String)
    case parsingResponse
    case complete
    case failed(String)
}

@Observable
@MainActor
final class AIService {
    private let toolExecutor = ToolExecutor()
    private var keychainService: KeychainService

    var generationStatus: GenerationStatus = .complete
    var totalTokensUsed: Int = 0

    init(keychainService: KeychainService) {
        self.keychainService = keychainService
    }

    func generatePlan(
        profile: UserProfile,
        schedule: WeeklySchedule,
        equipment: RunnerEquipment,
        stats: RunningStats,
        settings: AISettings,
        goalDescription: String,
        raceDistance: Double?,
        raceDate: Date?,
        startDate: Date,
        endDate: Date
    ) async throws -> String {
        generationStatus = .starting
        totalTokensUsed = 0

        let provider = makeProvider(for: settings)
        let tools = settings.provider == .anthropic
            ? ToolDefinitions.anthropicTools()
            : ToolDefinitions.openAITools()
        let systemPrompt = PromptBuilder.systemPrompt()
        let userPrompt = PromptBuilder.userPrompt(
            profile: profile,
            schedule: schedule,
            equipment: equipment,
            stats: stats,
            goalDescription: goalDescription,
            raceDistance: raceDistance,
            raceDate: raceDate,
            startDate: startDate,
            endDate: endDate
        )

        var messages: [AIMessage] = [.user(userPrompt)]
        let maxRounds = 10

        do {
            for _ in 0..<maxRounds {
                try Task.checkCancellation()
                generationStatus = .sendingToAI

                let response = try await provider.sendMessages(
                    messages,
                    systemPrompt: systemPrompt,
                    tools: tools,
                    model: settings.selectedModel
                )

                if let usage = response.usage {
                    totalTokensUsed += usage.inputTokens + usage.outputTokens
                }

                messages.append(response.message)

                if response.stopReason == .toolUse, let toolCalls = response.message.toolCalls {
                    for toolCall in toolCalls {
                        generationStatus = .executingTool(toolCall.name)
                    }

                    let results = await toolExecutor.executeAll(toolCalls)
                    try Task.checkCancellation()

                    for result in results {
                        messages.append(AIMessage(
                            role: .tool,
                            content: result.jsonString,
                            toolCallId: result.toolCallId
                        ))
                    }

                    continue
                }

                if response.stopReason == .maxTokens {
                    throw AIProviderError.modelError("Response was truncated — try a shorter plan")
                }

                generationStatus = .parsingResponse
                let content = response.message.content
                generationStatus = .complete
                return content
            }

            generationStatus = .failed("Max conversation rounds exceeded")
            throw AIProviderError.modelError("AI conversation exceeded maximum rounds")
        } catch {
            if case .complete = generationStatus { } else {
                generationStatus = .failed(error.localizedDescription)
            }
            throw error
        }
    }

    func validateKey(provider: AIProviderType, key: String) async throws -> Bool {
        let aiProvider: AIProvider = switch provider {
        case .anthropic: AnthropicProvider(apiKeyProvider: { key })
        case .openai: OpenAIProvider(apiKeyProvider: { key })
        }
        return try await aiProvider.validateAPIKey(key)
    }

    private func makeProvider(for settings: AISettings) -> AIProvider {
        switch settings.provider {
        case .anthropic:
            return AnthropicProvider(apiKeyProvider: { [keychainService] in
                keychainService.read(key: "anthropic_api_key")
            })
        case .openai:
            return OpenAIProvider(apiKeyProvider: { [keychainService] in
                keychainService.read(key: "openai_api_key")
            })
        }
    }
}
