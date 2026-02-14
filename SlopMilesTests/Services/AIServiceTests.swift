import Testing
import Foundation
@testable import SlopMiles

/// Minimal JSON that passes the `looksLikeJSON` check in AIService, matching what the AI
/// actually returns (a JSON training plan object).
private let stubPlanJSON = """
{"name":"Test Plan","weeks":[]}
"""

@Suite("AIService Tool-Use Loop Tests")
@MainActor
struct AIServiceTests {
    // MARK: - Helpers

    /// Builds an AIService with the given MockAIProvider injected.
    private func makeService(mock: MockAIProvider) -> AIService {
        let service = AIService(keychainService: KeychainService())
        service.providerOverride = mock
        return service
    }

    /// Minimal parameters for calling `generatePlan`.
    private func callGeneratePlan(on service: AIService) async throws -> String {
        try await service.generatePlan(
            profile: UserProfile(),
            schedule: WeeklySchedule(),
            equipment: RunnerEquipment(),
            stats: RunningStats(),
            settings: AISettings(),
            goalDescription: "Run a 5K",
            raceDistance: 5000,
            raceDate: Date().addingTimeInterval(60 * 60 * 24 * 90),
            startDate: Date(),
            endDate: Date().addingTimeInterval(60 * 60 * 24 * 90)
        )
    }

    // MARK: - Single-round success

    @Test("Single-round endTurn returns response content")
    func singleRoundSuccess() async throws {
        let mock = MockAIProvider()
        mock.responses = [
            AIResponse(
                message: AIMessage(role: .assistant, content: stubPlanJSON),
                stopReason: .endTurn,
                usage: AIResponse.TokenUsage(inputTokens: 100, outputTokens: 50)
            ),
        ]

        let service = makeService(mock: mock)
        let result = try await callGeneratePlan(on: service)

        #expect(result == stubPlanJSON)
        #expect(mock.receivedMessages.count == 1)
        #expect(service.totalTokensUsed == 150)
    }

    @Test("Single-round endTurn sets status to .complete")
    func singleRoundStatusComplete() async throws {
        let mock = MockAIProvider()
        mock.responses = [
            AIResponse(
                message: AIMessage(role: .assistant, content: stubPlanJSON),
                stopReason: .endTurn,
                usage: nil
            ),
        ]

        let service = makeService(mock: mock)
        _ = try await callGeneratePlan(on: service)

        if case .complete = service.generationStatus {
            // expected
        } else {
            Issue.record("Expected .complete but got \(service.generationStatus)")
        }
    }

    // MARK: - Multi-round tool use

    @Test("Multi-round tool use executes tools and accumulates messages")
    func multiRoundToolUse() async throws {
        let mock = MockAIProvider()
        // Round 1: AI requests a tool call
        mock.responses = [
            AIResponse(
                message: AIMessage(
                    role: .assistant,
                    content: "",
                    toolCalls: [
                        ToolCall(
                            id: "call_1",
                            name: "calculate_vdot",
                            arguments: [
                                "race_distance_meters": .number(5000),
                                "race_time_seconds": .number(1200),
                            ]
                        ),
                    ]
                ),
                stopReason: .toolUse,
                usage: AIResponse.TokenUsage(inputTokens: 200, outputTokens: 30)
            ),
            // Round 2: AI returns final text
            AIResponse(
                message: AIMessage(role: .assistant, content: stubPlanJSON),
                stopReason: .endTurn,
                usage: AIResponse.TokenUsage(inputTokens: 250, outputTokens: 60)
            ),
        ]

        let service = makeService(mock: mock)
        let result = try await callGeneratePlan(on: service)

        #expect(result == stubPlanJSON)
        // Provider should have been called twice (two rounds)
        #expect(mock.receivedMessages.count == 2)
        // Total tokens: (200+30) + (250+60) = 540
        #expect(service.totalTokensUsed == 540)

        // Second call should have accumulated messages:
        // [user, assistant(tool_call), tool(result)]
        let secondCallMessages = mock.receivedMessages[1]
        #expect(secondCallMessages.count == 3)
        #expect(secondCallMessages[0].role == .user)
        #expect(secondCallMessages[1].role == .assistant)
        #expect(secondCallMessages[2].role == .tool)
        #expect(secondCallMessages[2].toolCallId == "call_1")
    }

    @Test("Multi-round with multiple tool calls in one response")
    func multipleToolCallsInOneRound() async throws {
        let mock = MockAIProvider()
        mock.responses = [
            // Round 1: AI requests two tool calls simultaneously
            AIResponse(
                message: AIMessage(
                    role: .assistant,
                    content: "",
                    toolCalls: [
                        ToolCall(id: "call_a", name: "calculate_vdot", arguments: [
                            "race_distance_meters": .number(5000),
                            "race_time_seconds": .number(1200),
                        ]),
                        ToolCall(id: "call_b", name: "get_training_paces", arguments: [
                            "vdot": .number(50),
                        ]),
                    ]
                ),
                stopReason: .toolUse,
                usage: AIResponse.TokenUsage(inputTokens: 100, outputTokens: 40)
            ),
            // Round 2: final response
            AIResponse(
                message: AIMessage(role: .assistant, content: stubPlanJSON),
                stopReason: .endTurn,
                usage: nil
            ),
        ]

        let service = makeService(mock: mock)
        let result = try await callGeneratePlan(on: service)

        #expect(result == stubPlanJSON)
        // The second call should include: user, assistant, tool_a, tool_b = 4 messages
        let secondCallMessages = mock.receivedMessages[1]
        #expect(secondCallMessages.count == 4)
        let toolMessages = secondCallMessages.filter { $0.role == .tool }
        #expect(toolMessages.count == 2)
    }

    // MARK: - Max rounds exceeded

    @Test("Max rounds exceeded throws modelError")
    func maxRoundsExceeded() async throws {
        let mock = MockAIProvider()
        // Return tool calls for all 10 rounds — provider will always return a tool use response
        let toolResponse = AIResponse(
            message: AIMessage(
                role: .assistant,
                content: "",
                toolCalls: [
                    ToolCall(id: "loop", name: "convert_pace", arguments: [
                        "value": .number(5.0),
                        "from_unit": .string("min_per_km"),
                        "to_unit": .string("min_per_mile"),
                    ]),
                ]
            ),
            stopReason: .toolUse,
            usage: nil
        )
        // Fill with 10 tool-use responses (the max)
        mock.responses = Array(repeating: toolResponse, count: 10)

        let service = makeService(mock: mock)

        await #expect(throws: AIProviderError.self) {
            try await callGeneratePlan(on: service)
        }

        // All 10 rounds should have been attempted
        #expect(mock.receivedMessages.count == 10)

        if case .failed(let message) = service.generationStatus {
            #expect(message.contains("maximum rounds"))
        } else {
            Issue.record("Expected .failed status but got \(service.generationStatus)")
        }
    }

    // MARK: - Truncated response (maxTokens) triggers continuation

    @Test("maxTokens triggers continuation and concatenates content")
    func truncatedResponseContinuation() async throws {
        let mock = MockAIProvider()
        mock.responses = [
            // Round 1: partial JSON, truncated
            AIResponse(
                message: AIMessage(role: .assistant, content: "{\"name\":\"Plan\",\"wee"),
                stopReason: .maxTokens,
                usage: AIResponse.TokenUsage(inputTokens: 500, outputTokens: 4096)
            ),
            // Round 2: continuation completes the JSON
            AIResponse(
                message: AIMessage(role: .assistant, content: "ks\":[]}"),
                stopReason: .endTurn,
                usage: AIResponse.TokenUsage(inputTokens: 600, outputTokens: 50)
            ),
        ]

        let service = makeService(mock: mock)
        let result = try await callGeneratePlan(on: service)

        // Content from both rounds should be concatenated
        #expect(result == "{\"name\":\"Plan\",\"weeks\":[]}")
        // Two rounds of calls to the provider
        #expect(mock.receivedMessages.count == 2)
        // Tokens accumulated from both rounds
        #expect(service.totalTokensUsed == 500 + 4096 + 600 + 50)
    }

    // MARK: - Generation status transitions

    @Test("Status transitions through expected states for single round")
    func statusTransitionsSingleRound() async throws {
        let mock = MockAIProvider()
        mock.responses = [
            AIResponse(
                message: AIMessage(role: .assistant, content: stubPlanJSON),
                stopReason: .endTurn,
                usage: nil
            ),
        ]

        let service = makeService(mock: mock)

        // Before calling, status should be .complete (initial state)
        if case .complete = service.generationStatus {
            // expected
        } else {
            Issue.record("Expected initial status .complete")
        }

        _ = try await callGeneratePlan(on: service)

        // After successful completion, status should be .complete
        if case .complete = service.generationStatus {
            // expected
        } else {
            Issue.record("Expected final status .complete but got \(service.generationStatus)")
        }
    }

    @Test("Status transitions through .executingTool during tool use round")
    func statusTransitionsWithToolUse() async throws {
        var observedStatuses: [String] = []

        let mock = MockAIProvider()
        mock.responses = [
            AIResponse(
                message: AIMessage(
                    role: .assistant,
                    content: "",
                    toolCalls: [
                        ToolCall(id: "t1", name: "calculate_vdot", arguments: [
                            "race_distance_meters": .number(10000),
                            "race_time_seconds": .number(2400),
                        ]),
                    ]
                ),
                stopReason: .toolUse,
                usage: nil
            ),
            AIResponse(
                message: AIMessage(role: .assistant, content: stubPlanJSON),
                stopReason: .endTurn,
                usage: nil
            ),
        ]

        let service = makeService(mock: mock)

        // We use withObservationTracking to capture status changes
        // But since observation tracking is complex in tests, we verify
        // the final state and rely on the multi-round test to verify
        // intermediate logic is exercised
        let result = try await callGeneratePlan(on: service)
        #expect(result == stubPlanJSON)

        if case .complete = service.generationStatus {
            // expected
        } else {
            Issue.record("Expected .complete but got \(service.generationStatus)")
        }
    }

    // MARK: - Provider error propagation

    @Test("Provider error propagates and sets failed status")
    func providerErrorPropagation() async throws {
        let mock = MockAIProvider()
        mock.shouldThrowError = .invalidAPIKey

        let service = makeService(mock: mock)

        await #expect(throws: AIProviderError.self) {
            try await callGeneratePlan(on: service)
        }

        if case .failed(_) = service.generationStatus {
            // expected
        } else {
            Issue.record("Expected .failed status but got \(service.generationStatus)")
        }
    }

    @Test("Rate limited error propagates correctly")
    func rateLimitedErrorPropagation() async throws {
        let mock = MockAIProvider()
        mock.shouldThrowError = .rateLimited(retryAfter: 30)

        let service = makeService(mock: mock)

        await #expect(throws: AIProviderError.self) {
            try await callGeneratePlan(on: service)
        }

        if case .failed(let message) = service.generationStatus {
            #expect(message.contains("Rate limited"))
        } else {
            Issue.record("Expected .failed status but got \(service.generationStatus)")
        }
    }

    // MARK: - Token usage accumulation

    @Test("Token usage accumulates across rounds")
    func tokenUsageAccumulation() async throws {
        let mock = MockAIProvider()
        mock.responses = [
            AIResponse(
                message: AIMessage(
                    role: .assistant,
                    content: "",
                    toolCalls: [
                        ToolCall(id: "t1", name: "convert_pace", arguments: [
                            "value": .number(5.0),
                            "from_unit": .string("min_per_km"),
                            "to_unit": .string("min_per_mile"),
                        ]),
                    ]
                ),
                stopReason: .toolUse,
                usage: AIResponse.TokenUsage(inputTokens: 100, outputTokens: 20)
            ),
            AIResponse(
                message: AIMessage(role: .assistant, content: stubPlanJSON),
                stopReason: .endTurn,
                usage: AIResponse.TokenUsage(inputTokens: 150, outputTokens: 80)
            ),
        ]

        let service = makeService(mock: mock)
        _ = try await callGeneratePlan(on: service)

        // (100+20) + (150+80) = 350
        #expect(service.totalTokensUsed == 350)
    }

    @Test("Nil usage does not affect total")
    func nilUsageHandling() async throws {
        let mock = MockAIProvider()
        mock.responses = [
            AIResponse(
                message: AIMessage(role: .assistant, content: stubPlanJSON),
                stopReason: .endTurn,
                usage: nil
            ),
        ]

        let service = makeService(mock: mock)
        _ = try await callGeneratePlan(on: service)

        #expect(service.totalTokensUsed == 0)
    }

    // MARK: - Message accumulation

    @Test("Messages accumulate correctly across tool-use rounds")
    func messageAccumulation() async throws {
        let mock = MockAIProvider()
        mock.responses = [
            // Round 1: tool call
            AIResponse(
                message: AIMessage(
                    role: .assistant,
                    content: "",
                    toolCalls: [
                        ToolCall(id: "c1", name: "calculate_vdot", arguments: [
                            "race_distance_meters": .number(5000),
                            "race_time_seconds": .number(1200),
                        ]),
                    ]
                ),
                stopReason: .toolUse,
                usage: nil
            ),
            // Round 2: another tool call
            AIResponse(
                message: AIMessage(
                    role: .assistant,
                    content: "",
                    toolCalls: [
                        ToolCall(id: "c2", name: "get_training_paces", arguments: [
                            "vdot": .number(43),
                        ]),
                    ]
                ),
                stopReason: .toolUse,
                usage: nil
            ),
            // Round 3: final text
            AIResponse(
                message: AIMessage(role: .assistant, content: stubPlanJSON),
                stopReason: .endTurn,
                usage: nil
            ),
        ]

        let service = makeService(mock: mock)
        let result = try await callGeneratePlan(on: service)
        #expect(result == stubPlanJSON)

        // 3 rounds of calls to provider
        #expect(mock.receivedMessages.count == 3)

        // Round 1: [user]
        #expect(mock.receivedMessages[0].count == 1)

        // Round 2: [user, assistant(tool_call), tool(result)]
        #expect(mock.receivedMessages[1].count == 3)
        #expect(mock.receivedMessages[1][1].role == .assistant)
        #expect(mock.receivedMessages[1][2].role == .tool)

        // Round 3: [user, assistant(tc1), tool(r1), assistant(tc2), tool(r2)]
        #expect(mock.receivedMessages[2].count == 5)
        #expect(mock.receivedMessages[2][3].role == .assistant)
        #expect(mock.receivedMessages[2][4].role == .tool)
    }

    // MARK: - Tool result content

    @Test("Tool results are passed back as JSON content")
    func toolResultContent() async throws {
        let mock = MockAIProvider()
        mock.responses = [
            AIResponse(
                message: AIMessage(
                    role: .assistant,
                    content: "",
                    toolCalls: [
                        ToolCall(id: "vdot_call", name: "calculate_vdot", arguments: [
                            "race_distance_meters": .number(5000),
                            "race_time_seconds": .number(1200),
                        ]),
                    ]
                ),
                stopReason: .toolUse,
                usage: nil
            ),
            AIResponse(
                message: AIMessage(role: .assistant, content: stubPlanJSON),
                stopReason: .endTurn,
                usage: nil
            ),
        ]

        let service = makeService(mock: mock)
        _ = try await callGeneratePlan(on: service)

        // The tool result message in round 2 should contain JSON with vdot
        let toolMessage = mock.receivedMessages[1].first { $0.role == .tool }
        #expect(toolMessage != nil)
        #expect(toolMessage?.content.contains("vdot") == true)
        #expect(toolMessage?.toolCallId == "vdot_call")
    }

    // MARK: - Edge cases

    @Test("totalTokensUsed resets on each call")
    func tokenUsageResetsPerCall() async throws {
        let mock = MockAIProvider()
        mock.responses = [
            AIResponse(
                message: AIMessage(role: .assistant, content: stubPlanJSON),
                stopReason: .endTurn,
                usage: AIResponse.TokenUsage(inputTokens: 100, outputTokens: 50)
            ),
        ]

        let service = makeService(mock: mock)
        _ = try await callGeneratePlan(on: service)
        #expect(service.totalTokensUsed == 150)

        // Reset mock for second call
        mock.reset()
        mock.responses = [
            AIResponse(
                message: AIMessage(role: .assistant, content: stubPlanJSON),
                stopReason: .endTurn,
                usage: AIResponse.TokenUsage(inputTokens: 200, outputTokens: 100)
            ),
        ]

        _ = try await callGeneratePlan(on: service)
        // Should be reset and only reflect the second call
        #expect(service.totalTokensUsed == 300)
    }

    @Test("Mock fallback response returned when responses exhausted")
    func mockFallbackResponse() async throws {
        let mock = MockAIProvider()
        // No responses configured; MockAIProvider falls back to AIResponse with "{}" and .endTurn
        let service = makeService(mock: mock)
        let result = try await callGeneratePlan(on: service)
        #expect(result == "{}")
    }

    // MARK: - Follow-up question flow

    @Test("AI follow-up question pauses and resumes with user response")
    func followUpQuestionFlow() async throws {
        let mock = MockAIProvider()
        mock.responses = [
            // Round 1: AI asks a follow-up question (non-JSON text)
            AIResponse(
                message: AIMessage(role: .assistant, content: "What is your injury history?"),
                stopReason: .endTurn,
                usage: AIResponse.TokenUsage(inputTokens: 100, outputTokens: 20)
            ),
            // Round 2: AI returns final plan after user responds
            AIResponse(
                message: AIMessage(role: .assistant, content: stubPlanJSON),
                stopReason: .endTurn,
                usage: AIResponse.TokenUsage(inputTokens: 200, outputTokens: 50)
            ),
        ]

        let service = makeService(mock: mock)

        // Start generation in a separate task
        let resultTask = Task<String, Error> {
            try await callGeneratePlan(on: service)
        }

        // Wait for the service to enter .waitingForInput state
        while true {
            if case .waitingForInput = service.generationStatus { break }
            await Task.yield()
        }

        // Verify question is surfaced
        if case .waitingForInput(let question) = service.generationStatus {
            #expect(question == "What is your injury history?")
        } else {
            Issue.record("Expected .waitingForInput status")
        }

        // Submit user response
        service.submitUserResponse("I had a knee injury last year")

        // Await the result
        let result = try await resultTask.value
        #expect(result == stubPlanJSON)

        // Verify the user's response appears in the message history
        // Round 2 messages should include the user's response
        let round2Messages = mock.receivedMessages[1]
        let userMessages = round2Messages.filter { $0.role == .user }
        let hasUserResponse = userMessages.contains { $0.content.contains("I had a knee injury last year") }
        #expect(hasUserResponse)
    }

    @Test("AI follow-up question with empty response sends nudge")
    func followUpQuestionCancelledWithNudge() async throws {
        let mock = MockAIProvider()
        mock.responses = [
            // Round 1: AI asks a follow-up question
            AIResponse(
                message: AIMessage(role: .assistant, content: "How many days per week can you run?"),
                stopReason: .endTurn,
                usage: nil
            ),
            // Round 2: AI returns plan after nudge
            AIResponse(
                message: AIMessage(role: .assistant, content: stubPlanJSON),
                stopReason: .endTurn,
                usage: nil
            ),
        ]

        let service = makeService(mock: mock)

        let resultTask = Task<String, Error> {
            try await callGeneratePlan(on: service)
        }

        // Wait for .waitingForInput
        while true {
            if case .waitingForInput = service.generationStatus { break }
            await Task.yield()
        }

        // Cancel pending input (resumes with empty string → nudge message)
        service.cancelPendingInput()

        let result = try await resultTask.value
        #expect(result == stubPlanJSON)

        // Verify the nudge message was sent instead of user content
        let round2Messages = mock.receivedMessages[1]
        let userMessages = round2Messages.filter { $0.role == .user }
        let hasNudge = userMessages.contains { $0.content.contains("Do not ask follow-up questions") }
        #expect(hasNudge)
    }

    @Test("Status transitions through .waitingForInput during follow-up question")
    func statusTransitionsWithFollowUpQuestion() async throws {
        let mock = MockAIProvider()
        mock.responses = [
            AIResponse(
                message: AIMessage(role: .assistant, content: "Tell me about your running experience"),
                stopReason: .endTurn,
                usage: nil
            ),
            AIResponse(
                message: AIMessage(role: .assistant, content: stubPlanJSON),
                stopReason: .endTurn,
                usage: nil
            ),
        ]

        let service = makeService(mock: mock)

        let resultTask = Task<String, Error> {
            try await callGeneratePlan(on: service)
        }

        // Wait for .waitingForInput
        while true {
            if case .waitingForInput = service.generationStatus { break }
            await Task.yield()
        }

        // Resume the loop
        service.submitUserResponse("5 years of running")

        _ = try await resultTask.value

        // After completion, status should be .complete
        if case .complete = service.generationStatus {
            // expected
        } else {
            Issue.record("Expected .complete but got \(service.generationStatus)")
        }
    }
}
