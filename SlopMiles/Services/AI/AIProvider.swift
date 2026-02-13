import Foundation

// MARK: - JSONValue

/// A type-safe, `Sendable` replacement for `[String: Any]` dictionaries that cross actor
/// boundaries. Every value in the AI tool-use pipeline (tool arguments, tool results,
/// tool definitions, prompt dictionaries) is expressed as `JSONValue` so that the compiler
/// can verify `Sendable` conformance without `@unchecked` escape hatches.
enum JSONValue: Sendable, Equatable {
    case string(String)
    case number(Double)
    case int(Int)
    case bool(Bool)
    case array([JSONValue])
    case object([String: JSONValue])
    case null

    // MARK: Convenience initialisers / literals

    /// Convert an untyped `Any` value (e.g. from `JSONSerialization`) into a `JSONValue`.
    static func from(_ value: Any) -> JSONValue {
        switch value {
        case let s as String:
            return .string(s)
        case let b as Bool:
            // Must check Bool before numeric types because `Bool` bridges to `NSNumber`.
            return .bool(b)
        case let n as NSNumber:
            // Distinguish integers from floating-point.
            if CFNumberIsFloatType(n) {
                return .number(n.doubleValue)
            }
            return .int(n.intValue)
        case let a as [Any]:
            return .array(a.map { from($0) })
        case let d as [String: Any]:
            return .object(d.mapValues { from($0) })
        default:
            if value is NSNull {
                return .null
            }
            // Last resort: coerce to string.
            return .string(String(describing: value))
        }
    }

    /// Convert back to an untyped `Any` suitable for `JSONSerialization`.
    var anyValue: Any {
        switch self {
        case .string(let s): return s
        case .number(let n): return n
        case .int(let i): return i
        case .bool(let b): return b
        case .array(let a): return a.map(\.anyValue)
        case .object(let d): return d.mapValues(\.anyValue)
        case .null: return NSNull()
        }
    }

    // MARK: Type-safe accessors

    var stringValue: String? {
        if case .string(let s) = self { return s }
        return nil
    }

    var doubleValue: Double? {
        switch self {
        case .number(let n): return n
        case .int(let i): return Double(i)
        default: return nil
        }
    }

    var intValue: Int? {
        switch self {
        case .int(let i): return i
        case .number(let n): return Int(exactly: n)
        default: return nil
        }
    }

    var boolValue: Bool? {
        if case .bool(let b) = self { return b }
        return nil
    }

    var arrayValue: [JSONValue]? {
        if case .array(let a) = self { return a }
        return nil
    }

    var objectValue: [String: JSONValue]? {
        if case .object(let d) = self { return d }
        return nil
    }

    /// Convenience subscript for object access.
    subscript(key: String) -> JSONValue? {
        objectValue?[key]
    }
}

// MARK: - ExpressibleBy literals

extension JSONValue: ExpressibleByStringLiteral {
    init(stringLiteral value: String) { self = .string(value) }
}

extension JSONValue: ExpressibleByIntegerLiteral {
    init(integerLiteral value: Int) { self = .int(value) }
}

extension JSONValue: ExpressibleByFloatLiteral {
    init(floatLiteral value: Double) { self = .number(value) }
}

extension JSONValue: ExpressibleByBooleanLiteral {
    init(booleanLiteral value: Bool) { self = .bool(value) }
}

extension JSONValue: ExpressibleByArrayLiteral {
    init(arrayLiteral elements: JSONValue...) { self = .array(elements) }
}

extension JSONValue: ExpressibleByDictionaryLiteral {
    init(dictionaryLiteral elements: (String, JSONValue)...) {
        self = .object(Dictionary(uniqueKeysWithValues: elements))
    }
}

extension JSONValue: ExpressibleByNilLiteral {
    init(nilLiteral: ()) { self = .null }
}

// MARK: - AIRole

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
        tools: [[String: JSONValue]],
        model: String
    ) async throws -> AIResponse

    func validateAPIKey(_ key: String) async throws -> Bool
}
