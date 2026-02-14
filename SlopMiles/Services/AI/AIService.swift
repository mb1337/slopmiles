import Foundation
import os

private let logger = Logger(subsystem: "com.slopmiles", category: "ai")

enum GenerationStatus: Sendable {
    case starting
    case sendingToAI
    case executingTool(String)
    case generatingBatch(current: Int, total: Int)
    case parsingResponse
    case waitingForInput(String)
    case complete
    case failed(String)
}

@Observable
@MainActor
final class AIService {
    private let toolExecutor = ToolExecutor()
    private var keychainService: KeychainService

    /// Override for testing — when set, `generatePlan` uses this instead of building a real provider.
    var providerOverride: AIProvider?

    var generationStatus: GenerationStatus = .complete
    var totalTokensUsed: Int = 0
    private var pendingInputContinuation: CheckedContinuation<String, Never>?

    init(keychainService: KeychainService) {
        self.keychainService = keychainService
    }

    private static let batchSize = 4

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

        let provider = providerOverride ?? makeProvider(for: settings)
        let tools = settings.provider == .anthropic
            ? ToolDefinitions.anthropicTools()
            : ToolDefinitions.openAITools()
        let systemPrompt = PromptBuilder.systemPrompt()

        let totalWeeks = max(1, Calendar.current.dateComponents([.weekOfYear], from: startDate, to: endDate).weekOfYear ?? 1)
        let batchCount = totalWeeks <= Self.batchSize ? 1 : Int((Double(totalWeeks) / Double(Self.batchSize)).rounded(.up))

        // Single-batch: no batching overhead
        if batchCount == 1 {
            let userPrompt = PromptBuilder.userPrompt(
                profile: profile, schedule: schedule, equipment: equipment,
                stats: stats, goalDescription: goalDescription,
                raceDistance: raceDistance, raceDate: raceDate,
                startDate: startDate, endDate: endDate
            )
            var messages: [AIMessage] = [.user(userPrompt)]
            do {
                let content = try await runConversationLoop(
                    messages: &messages, provider: provider,
                    systemPrompt: systemPrompt, tools: tools,
                    model: settings.selectedModel
                )
                generationStatus = .complete
                return content
            } catch {
                if case .complete = generationStatus { } else {
                    generationStatus = .failed(error.localizedDescription)
                }
                throw error
            }
        }

        // Multi-batch
        var messages: [AIMessage] = []
        var batchResults: [[String: Any]] = []

        do {
            for batchIndex in 0..<batchCount {
                let batchStart = batchIndex * Self.batchSize + 1
                let batchEnd = min(batchStart + Self.batchSize - 1, totalWeeks)

                if batchIndex == 0 {
                    let userPrompt = PromptBuilder.userPrompt(
                        profile: profile, schedule: schedule, equipment: equipment,
                        stats: stats, goalDescription: goalDescription,
                        raceDistance: raceDistance, raceDate: raceDate,
                        startDate: startDate, endDate: endDate,
                        batchRange: (start: batchStart, end: batchEnd, total: totalWeeks)
                    )
                    messages = [.user(userPrompt)]
                } else {
                    generationStatus = .generatingBatch(current: batchIndex + 1, total: batchCount)
                    let continuation = PromptBuilder.batchContinuationPrompt(
                        batchStart: batchStart, batchEnd: batchEnd, totalWeeks: totalWeeks
                    )
                    messages.append(.user(continuation))
                }

                let content = try await runConversationLoop(
                    messages: &messages, provider: provider,
                    systemPrompt: systemPrompt, tools: tools,
                    model: settings.selectedModel
                )

                guard let dict = try ResponseParser.extractJSON(from: content) as? [String: Any] else {
                    throw AIProviderError.modelError("Batch \(batchIndex + 1) returned invalid JSON")
                }
                batchResults.append(dict)
            }

            let merged = mergeBatchResults(batchResults)
            let mergedData = try JSONSerialization.data(withJSONObject: merged, options: [.sortedKeys])
            guard let mergedString = String(data: mergedData, encoding: .utf8) else {
                throw AIProviderError.modelError("Failed to serialize merged batch results")
            }

            generationStatus = .complete
            return mergedString
        } catch {
            if case .complete = generationStatus { } else {
                generationStatus = .failed(error.localizedDescription)
            }
            throw error
        }
    }

    /// Runs the inner conversation loop (tool calls, truncation, follow-ups) until the AI returns a final JSON response.
    private func runConversationLoop(
        messages: inout [AIMessage],
        provider: AIProvider,
        systemPrompt: String,
        tools: [[String: JSONValue]],
        model: String,
        maxRounds: Int = 10
    ) async throws -> String {
        var accumulatedContent = ""

        for round in 0..<maxRounds {
            try Task.checkCancellation()
            generationStatus = .sendingToAI
            logger.info("AI loop round \(round + 1)/\(maxRounds)")

            let response = try await provider.sendMessages(
                messages,
                systemPrompt: systemPrompt,
                tools: tools,
                model: model
            )

            if let usage = response.usage {
                totalTokensUsed += usage.inputTokens + usage.outputTokens
            }

            messages.append(response.message)

            if let toolCalls = response.message.toolCalls, !toolCalls.isEmpty {
                let toolNames = toolCalls.map(\.name).joined(separator: ", ")
                logger.info("Executing tools: \(toolNames, privacy: .public)")
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
                accumulatedContent += response.message.content
                logger.info("Response truncated at \(response.message.content.count) chars (accumulated \(accumulatedContent.count)), requesting continuation")
                messages.append(.user("Continue the JSON output from exactly where you stopped. Do not repeat any content already produced."))
                continue
            }

            let content = accumulatedContent + response.message.content

            if !looksLikeJSON(content) {
                logger.info("AI returned non-JSON text (\(content.count) chars), surfacing as question")
                generationStatus = .waitingForInput(content)
                let userResponse = await withCheckedContinuation { continuation in
                    self.pendingInputContinuation = continuation
                }
                self.pendingInputContinuation = nil
                try Task.checkCancellation()

                if userResponse.isEmpty {
                    messages.append(.user("Do not ask follow-up questions. Use the available tools with your best judgment for any missing data, then respond with the final JSON training plan."))
                } else {
                    messages.append(.user(userResponse))
                }
                continue
            }

            generationStatus = .parsingResponse
            logger.info("AI complete: content=\(content.count) chars, totalTokens=\(self.totalTokensUsed)")
            return content
        }

        throw AIProviderError.modelError("AI conversation exceeded maximum rounds")
    }

    private func mergeBatchResults(_ batches: [[String: Any]]) -> [String: Any] {
        guard var merged = batches.first else { return [:] }

        var allWeeks: [[String: Any]] = []
        for batch in batches {
            if let weeks = batch["weeks"] as? [[String: Any]] {
                allWeeks.append(contentsOf: weeks)
            }
        }

        // Renumber weeks sequentially
        for i in allWeeks.indices {
            allWeeks[i]["week_number"] = i + 1
        }

        merged["weeks"] = allWeeks
        return merged
    }

    func validateKey(provider: AIProviderType, key: String) async throws -> Bool {
        let aiProvider: AIProvider = switch provider {
        case .anthropic: AnthropicProvider(apiKeyProvider: { key })
        case .openai: OpenAICompatibleProvider.openAI(apiKeyProvider: { key })
        case .openRouter: OpenAICompatibleProvider.openRouter(apiKeyProvider: { key })
        }
        return try await aiProvider.validateAPIKey(key)
    }

    func submitUserResponse(_ text: String) {
        pendingInputContinuation?.resume(returning: text)
        pendingInputContinuation = nil
    }

    func cancelPendingInput() {
        pendingInputContinuation?.resume(returning: "")
        pendingInputContinuation = nil
    }

    private func looksLikeJSON(_ text: String) -> Bool {
        text.contains("{") && text.contains("}")
    }

    private func makeProvider(for settings: AISettings) -> AIProvider {
        let keychainKey = settings.provider.keychainKey
        switch settings.provider {
        case .anthropic:
            return AnthropicProvider(apiKeyProvider: { [keychainService] in
                keychainService.read(key: keychainKey)
            })
        case .openai:
            return OpenAICompatibleProvider.openAI(apiKeyProvider: { [keychainService] in
                keychainService.read(key: keychainKey)
            })
        case .openRouter:
            return OpenAICompatibleProvider.openRouter(apiKeyProvider: { [keychainService] in
                keychainService.read(key: keychainKey)
            })
        }
    }
}
