import Foundation
import SwiftData
import os

private let logger = Logger(subsystem: "com.slopmiles", category: "coaching")

@Observable
@MainActor
final class CoachingService {
    enum Status: Sendable {
        case idle
        case thinking
        case executingTool(String)
        case failed(String)
    }

    var status: Status = .idle
    var totalTokensUsed: Int = 0
    /// Override for testing — when set, messaging methods use this provider instead of creating a real one.
    var providerOverride: AIProvider?

    private var keychainService: KeychainService
    private let toolExecutor = CoachingToolExecutor()

    init(keychainService: KeychainService) {
        self.keychainService = keychainService
    }

    // MARK: - Entry Points

    func sendMessage(
        _ text: String,
        conversation: CoachingConversation,
        settings: AISettings,
        context: ModelContext,
        healthKitService: HealthKitService,
        workoutKitService: WorkoutKitService,
        calendarService: CalendarService
    ) async {
        let userMessage = CoachingMessage(role: .user, content: text)
        conversation.appendMessage(userMessage)

        let provider = providerOverride ?? makeProvider(for: settings)
        let tools = toolsForProvider(settings.provider)
        let messages = buildAIMessages(from: conversation)

        await runAgentLoop(
            messages: messages,
            provider: provider,
            systemPrompt: CoachingPromptBuilder.systemPrompt(),
            tools: tools,
            model: settings.selectedModel,
            conversation: conversation,
            context: context,
            healthKitService: healthKitService,
            workoutKitService: workoutKitService,
            calendarService: calendarService
        )
    }

    func handleWorkoutCompletion(
        workout: PlannedWorkout,
        conversation: CoachingConversation,
        settings: AISettings,
        context: ModelContext,
        healthKitService: HealthKitService,
        workoutKitService: WorkoutKitService,
        calendarService: CalendarService
    ) async {
        let prompt = CoachingPromptBuilder.workoutCompletionPrompt(workout: workout)
        let userMessage = CoachingMessage(role: .user, content: prompt)
        conversation.appendMessage(userMessage)

        let provider = providerOverride ?? makeProvider(for: settings)
        let tools = toolsForProvider(settings.provider)
        let messages = buildAIMessages(from: conversation)

        await runAgentLoop(
            messages: messages,
            provider: provider,
            systemPrompt: CoachingPromptBuilder.systemPrompt(),
            tools: tools,
            model: settings.selectedModel,
            conversation: conversation,
            context: context,
            healthKitService: healthKitService,
            workoutKitService: workoutKitService,
            calendarService: calendarService
        )
    }

    func generateWeekWorkouts(
        week: TrainingWeek,
        plan: TrainingPlan,
        performanceData: WeeklyPerformanceData,
        conversation: CoachingConversation,
        settings: AISettings,
        context: ModelContext,
        healthKitService: HealthKitService,
        workoutKitService: WorkoutKitService,
        calendarService: CalendarService
    ) async {
        let prompt = CoachingPromptBuilder.weekGenerationPrompt(
            week: week, plan: plan, performanceData: performanceData
        )
        let userMessage = CoachingMessage(role: .user, content: prompt)
        conversation.appendMessage(userMessage)

        let provider = providerOverride ?? makeProvider(for: settings)
        let tools = toolsForProvider(settings.provider)
        let messages = buildAIMessages(from: conversation)

        await runAgentLoop(
            messages: messages,
            provider: provider,
            systemPrompt: CoachingPromptBuilder.systemPrompt(),
            tools: tools,
            model: settings.selectedModel,
            conversation: conversation,
            context: context,
            healthKitService: healthKitService,
            workoutKitService: workoutKitService,
            calendarService: calendarService
        )
    }

    // MARK: - Agent Loop

    private func runAgentLoop(
        messages: [AIMessage],
        provider: AIProvider,
        systemPrompt: String,
        tools: [[String: JSONValue]],
        model: String,
        conversation: CoachingConversation,
        context: ModelContext,
        healthKitService: HealthKitService,
        workoutKitService: WorkoutKitService,
        calendarService: CalendarService,
        maxRounds: Int = 10
    ) async {
        var messages = messages
        status = .thinking
        totalTokensUsed = 0

        for round in 0..<maxRounds {
            do {
                try Task.checkCancellation()
            } catch {
                status = .idle
                return
            }

            logger.info("Coaching loop round \(round + 1)/\(maxRounds)")

            let response: AIResponse
            do {
                response = try await provider.sendMessages(
                    messages,
                    systemPrompt: systemPrompt,
                    tools: tools,
                    model: model
                )
            } catch {
                let errorMsg = error.localizedDescription
                logger.error("AI call failed: \(errorMsg)")
                status = .failed(errorMsg)
                let errorMessage = CoachingMessage(role: .assistant, content: "Sorry, I encountered an error: \(errorMsg)")
                conversation.appendMessage(errorMessage)
                return
            }

            if let usage = response.usage {
                totalTokensUsed += usage.inputTokens + usage.outputTokens
            }

            messages.append(response.message)

            switch response.stopReason {
            case .endTurn:
                let content = response.message.content
                if !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    let assistantMessage = CoachingMessage(role: .assistant, content: content)
                    conversation.appendMessage(assistantMessage)
                }
                try? context.save()
                status = .idle
                logger.info("Coaching loop complete: \(self.totalTokensUsed) tokens")
                return

            case .toolUse:
                guard let toolCalls = response.message.toolCalls, !toolCalls.isEmpty else {
                    status = .idle
                    return
                }

                // Save assistant text if any
                if !response.message.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    let textMessage = CoachingMessage(role: .assistant, content: response.message.content)
                    conversation.appendMessage(textMessage)
                }

                // Execute each tool call
                for toolCall in toolCalls {
                    status = .executingTool(toolCall.name)
                    logger.info("Executing tool: \(toolCall.name)")

                    // Record the tool call in conversation
                    let toolMessage = CoachingMessage(
                        role: .tool,
                        content: toolCall.name,
                        toolName: toolCall.name,
                        toolCallId: toolCall.id
                    )
                    conversation.appendMessage(toolMessage)

                    let (id, result) = await toolExecutor.execute(
                        toolCall,
                        context: context,
                        healthKitService: healthKitService,
                        workoutKitService: workoutKitService,
                        calendarService: calendarService
                    )

                    // Record the tool result in conversation
                    let resultMessage = CoachingMessage(
                        role: .toolResult,
                        content: result,
                        toolName: toolCall.name,
                        toolCallId: id
                    )
                    conversation.appendMessage(resultMessage)

                    // Add to AI message history
                    messages.append(AIMessage(
                        role: .tool,
                        content: result,
                        toolCallId: id
                    ))
                }

                status = .thinking
                continue

            case .maxTokens:
                messages.append(.user("Continue from where you stopped."))
                continue
            }
        }

        status = .failed("Coaching loop exceeded maximum rounds")
        let errorMessage = CoachingMessage(role: .assistant, content: "I ran into a problem processing your request. Please try again.")
        conversation.appendMessage(errorMessage)
    }

    // MARK: - Message Building

    private func buildAIMessages(from conversation: CoachingConversation, limit: Int = 50) -> [AIMessage] {
        let stored = conversation.messages
        let trimmed = stored.count > limit ? Array(stored.suffix(limit)) : stored

        var aiMessages: [AIMessage] = []
        for msg in trimmed {
            switch msg.role {
            case .user:
                aiMessages.append(.user(msg.content))
            case .assistant:
                aiMessages.append(AIMessage(role: .assistant, content: msg.content))
            case .tool:
                // Tool call records are part of the assistant message, skip them
                // in the AI message reconstruction (the assistant message with toolCalls
                // is already represented by the preceding assistant message)
                break
            case .toolResult:
                aiMessages.append(AIMessage(
                    role: .tool,
                    content: msg.content,
                    toolCallId: msg.toolCallId
                ))
            }
        }

        return aiMessages
    }

    // MARK: - Provider Setup

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

    private func toolsForProvider(_ provider: AIProviderType) -> [[String: JSONValue]] {
        switch provider {
        case .anthropic:
            return CoachingToolDefinitions.anthropicTools()
        case .openai, .openRouter:
            return CoachingToolDefinitions.openAITools()
        }
    }
}
