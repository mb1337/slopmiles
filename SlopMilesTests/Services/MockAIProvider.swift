import Foundation
@testable import SlopMiles

final class MockAIProvider: AIProvider, @unchecked Sendable {
    var responses: [AIResponse] = []
    private var callIndex = 0
    var receivedMessages: [[AIMessage]] = []
    var shouldThrowError: AIProviderError?

    func sendMessages(
        _ messages: [AIMessage],
        systemPrompt: String,
        tools: [[String: JSONValue]],
        model: String
    ) async throws -> AIResponse {
        receivedMessages.append(messages)

        if let error = shouldThrowError { throw error }

        guard callIndex < responses.count else {
            return AIResponse(
                message: AIMessage(role: .assistant, content: "{}"),
                stopReason: .endTurn, usage: nil
            )
        }

        let response = responses[callIndex]
        callIndex += 1
        return response
    }

    func validateAPIKey(_ key: String) async throws -> Bool {
        key == "valid-key"
    }

    func reset() {
        callIndex = 0
        receivedMessages = []
    }
}
