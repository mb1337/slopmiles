import Testing
import Foundation
@testable import SlopMiles

/// Minimal JSON that passes the `looksLikeJSON` check in AIService, matching what the AI
/// actually returns (a JSON training plan object).
private let stubPlanJSON = """
{"name":"Test Plan","weeks":[]}
"""

private let stubOutlineJSON = """
{"name":"Test Plan","goal_description":"Run a 5K","vdot":45,"weeks":[{"week_number":1,"theme":"Base","target_distance_km":30,"notes":"Easy start"}]}
"""

private let stubWeekJSON = """
{"week_number":1,"theme":"Base","total_distance_km":30,"notes":"Easy start","workouts":[{"name":"Easy Run","type":"easy","day_of_week":2,"distance_km":8,"duration_minutes":48,"location":"outdoor","notes":"","steps":[]}]}
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

    /// Minimal parameters for calling `generatePlan`. Defaults to 4-week plan.
    private func callGeneratePlan(on service: AIService, weeks: Int = 4) async throws -> String {
        let start = Date()
        let end = Calendar.current.date(byAdding: .weekOfYear, value: weeks, to: start)!
        return try await service.generatePlan(
            profile: UserProfile(),
            schedule: WeeklySchedule(),
            equipment: RunnerEquipment(),
            stats: RunningStats(),
            settings: AISettings(),
            goalDescription: "Run a 5K",
            raceDistance: 5000,
            raceDate: end,
            startDate: start,
            endDate: end
        )
    }

    private func callGenerateOutline(on service: AIService) async throws -> String {
        let start = Date()
        let end = Calendar.current.date(byAdding: .weekOfYear, value: 8, to: start)!
        return try await service.generatePlanOutline(
            profile: UserProfile(),
            schedule: WeeklySchedule(),
            equipment: RunnerEquipment(),
            stats: RunningStats(),
            settings: AISettings(),
            goalDescription: "Run a 5K",
            raceDistance: 5000,
            raceDate: end,
            startDate: start,
            endDate: end
        )
    }

    private func callGenerateWeekWorkouts(on service: AIService) async throws -> String {
        let plan = TrainingPlan(name: "Test", goalDescription: "5K", startDate: Date(), endDate: Date())
        plan.cachedVDOT = 45
        let week = TrainingWeek(weekNumber: 1, theme: "Base", totalDistanceKm: 30)
        return try await service.generateWeekWorkouts(
            plan: plan, week: week,
            profile: UserProfile(),
            schedule: WeeklySchedule(),
            equipment: RunnerEquipment(),
            settings: AISettings(),
            performanceData: WeeklyPerformanceData()
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

    // MARK: - Max rounds exceeded

    @Test("Max rounds exceeded throws modelError")
    func maxRoundsExceeded() async throws {
        let mock = MockAIProvider()
        // Return empty content for all 10 rounds — triggers retry each time
        let emptyResponse = AIResponse(
            message: AIMessage(role: .assistant, content: ""),
            stopReason: .endTurn,
            usage: nil
        )
        mock.responses = Array(repeating: emptyResponse, count: 10)

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

        // Cancel pending input (resumes with empty string -> nudge message)
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

    // MARK: - Outline generation

    @Test("generatePlanOutline returns outline JSON and sets correct status")
    func outlineGenerationSuccess() async throws {
        let mock = MockAIProvider()
        mock.responses = [
            AIResponse(
                message: AIMessage(role: .assistant, content: stubOutlineJSON),
                stopReason: .endTurn,
                usage: AIResponse.TokenUsage(inputTokens: 300, outputTokens: 100)
            ),
        ]

        let service = makeService(mock: mock)
        let result = try await callGenerateOutline(on: service)

        #expect(result == stubOutlineJSON)
        #expect(service.totalTokensUsed == 400)
        if case .complete = service.generationStatus {
            // expected
        } else {
            Issue.record("Expected .complete but got \(service.generationStatus)")
        }
    }

    @Test("generatePlanOutline error sets failed status")
    func outlineGenerationError() async throws {
        let mock = MockAIProvider()
        mock.shouldThrowError = .invalidAPIKey

        let service = makeService(mock: mock)

        await #expect(throws: AIProviderError.self) {
            try await callGenerateOutline(on: service)
        }

        if case .failed(_) = service.generationStatus {
            // expected
        } else {
            Issue.record("Expected .failed status but got \(service.generationStatus)")
        }
    }

    // MARK: - Weekly workout generation

    @Test("generateWeekWorkouts returns week JSON and sets correct status")
    func weeklyGenerationSuccess() async throws {
        let mock = MockAIProvider()
        mock.responses = [
            AIResponse(
                message: AIMessage(role: .assistant, content: stubWeekJSON),
                stopReason: .endTurn,
                usage: AIResponse.TokenUsage(inputTokens: 200, outputTokens: 80)
            ),
        ]

        let service = makeService(mock: mock)
        let result = try await callGenerateWeekWorkouts(on: service)

        #expect(result == stubWeekJSON)
        #expect(service.totalTokensUsed == 280)
        if case .complete = service.generationStatus {
            // expected
        } else {
            Issue.record("Expected .complete but got \(service.generationStatus)")
        }
    }

    @Test("generateWeekWorkouts error sets failed status")
    func weeklyGenerationError() async throws {
        let mock = MockAIProvider()
        mock.shouldThrowError = .networkError(URLError(.notConnectedToInternet))

        let service = makeService(mock: mock)

        await #expect(throws: AIProviderError.self) {
            try await callGenerateWeekWorkouts(on: service)
        }

        if case .failed(_) = service.generationStatus {
            // expected
        } else {
            Issue.record("Expected .failed status but got \(service.generationStatus)")
        }
    }
}
