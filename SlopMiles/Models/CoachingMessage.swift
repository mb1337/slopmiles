import Foundation
import SwiftData

@Model
final class CoachingConversation {
    var id: UUID = UUID()
    var messagesJSON: String = "[]"
    var planID: UUID?
    var createdAt: Date = Date()
    var updatedAt: Date = Date()

    var messages: [CoachingMessage] {
        get {
            guard let data = messagesJSON.data(using: .utf8),
                  let decoded = try? JSONDecoder().decode([CoachingMessage].self, from: data) else {
                return []
            }
            return decoded
        }
        set {
            if let data = try? JSONEncoder().encode(newValue) {
                messagesJSON = String(data: data, encoding: .utf8) ?? "[]"
            }
        }
    }

    func appendMessage(_ message: CoachingMessage) {
        var current = messages
        current.append(message)
        messages = current
        updatedAt = Date()
    }

    func trimOldMessages(keepLast count: Int) {
        var current = messages
        guard current.count > count else { return }
        current = Array(current.suffix(count))
        messages = current
    }

    init() {}
}

struct CoachingMessage: Codable, Sendable, Identifiable {
    var id: UUID = UUID()
    var role: Role
    var content: String
    var timestamp: Date = Date()
    var toolName: String?
    var toolCallId: String?
    var toolCalls: [ToolCall]?

    enum Role: String, Codable, Sendable {
        case user
        case assistant
        case assistantToolCall
        case tool
        case toolResult
    }

    init(role: Role, content: String, toolName: String? = nil, toolCallId: String? = nil, toolCalls: [ToolCall]? = nil) {
        self.role = role
        self.content = content
        self.toolName = toolName
        self.toolCallId = toolCallId
        self.toolCalls = toolCalls
    }
}
