import Foundation

enum AIRole: String, Sendable {
    case system
    case user
    case assistant
    case tool
}

struct AIMessage: Sendable {
    let role: AIRole
    let content: String
    let toolCalls: [ToolCall]?
    let toolCallId: String?

    init(role: AIRole, content: String, toolCalls: [ToolCall]? = nil, toolCallId: String? = nil) {
        self.role = role
        self.content = content
        self.toolCalls = toolCalls
        self.toolCallId = toolCallId
    }

    static func system(_ content: String) -> AIMessage {
        AIMessage(role: .system, content: content)
    }

    static func user(_ content: String) -> AIMessage {
        AIMessage(role: .user, content: content)
    }
}

enum AIProviderError: Error, LocalizedError {
    case invalidAPIKey
    case networkError(Error)
    case rateLimited(retryAfter: Int?)
    case invalidResponse(String)
    case modelError(String)

    var errorDescription: String? {
        switch self {
        case .invalidAPIKey: return "Invalid API key. Please check your settings."
        case .networkError(let e): return "Network error: \(e.localizedDescription)"
        case .rateLimited(let retry):
            if let r = retry { return "Rate limited. Retry after \(r) seconds." }
            return "Rate limited. Please try again later."
        case .invalidResponse(let msg): return "Invalid response: \(msg)"
        case .modelError(let msg): return "Model error: \(msg)"
        }
    }
}

struct AIResponse: Sendable {
    let message: AIMessage
    let stopReason: StopReason
    let usage: TokenUsage?

    enum StopReason: Sendable {
        case endTurn
        case toolUse
        case maxTokens
    }

    struct TokenUsage: Sendable {
        let inputTokens: Int
        let outputTokens: Int
    }
}

protocol AIProvider: Sendable {
    func sendMessages(
        _ messages: [AIMessage],
        systemPrompt: String,
        tools: [[String: Any]],
        model: String
    ) async throws -> AIResponse

    func validateAPIKey(_ key: String) async throws -> Bool
}
