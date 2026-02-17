import Foundation
import os

private let logger = Logger(subsystem: "com.slopmiles", category: "ai")

final class AnthropicProvider: AIProvider, @unchecked Sendable {
    private let session: URLSession
    private let apiKey: @Sendable () -> String?

    init(apiKeyProvider: @escaping @Sendable () -> String?) {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 120
        self.session = URLSession(configuration: config)
        self.apiKey = apiKeyProvider
    }

    func sendMessages(
        _ messages: [AIMessage],
        systemPrompt: String,
        tools: [[String: JSONValue]],
        model: String
    ) async throws -> AIResponse {
        guard let key = apiKey() else { throw AIProviderError.invalidAPIKey }

        var request = URLRequest(url: URL(string: "https://api.anthropic.com/v1/messages")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(key, forHTTPHeaderField: "x-api-key")
        request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")

        var body: [String: Any] = [
            "model": model,
            "max_tokens": 8192,
            "system": systemPrompt,
            "messages": encodeMessages(messages),
        ]
        if !tools.isEmpty {
            body["tools"] = tools.map { $0.mapValues(\.anyValue) }
        }

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        logger.info("Anthropic request: model=\(model, privacy: .public), messages=\(messages.count), tools=\(tools.count), systemPrompt=\(systemPrompt.count) chars")

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw AIProviderError.invalidResponse("Not an HTTP response")
        }

        if httpResponse.statusCode == 401 { throw AIProviderError.invalidAPIKey }
        if httpResponse.statusCode == 429 {
            let retry = httpResponse.value(forHTTPHeaderField: "retry-after").flatMap(Int.init)
            logger.error("Anthropic rate limited, retry-after=\(retry ?? -1)")
            throw AIProviderError.rateLimited(retryAfter: retry)
        }

        guard httpResponse.statusCode == 200 else {
            let errorBody = String(data: data, encoding: .utf8) ?? "Unknown error"
            logger.error("Anthropic HTTP \(httpResponse.statusCode): \(errorBody, privacy: .public)")
            throw AIProviderError.modelError("HTTP \(httpResponse.statusCode): \(errorBody)")
        }

        let rawBody = (String(data: data.prefix(2048), encoding: .utf8) ?? "<non-utf8>").trimmingCharacters(in: .whitespacesAndNewlines)
        logger.debug("Anthropic raw response: \(rawBody, privacy: .public)")

        return try parseResponse(data)
    }

    func validateAPIKey(_ key: String) async throws -> Bool {
        var request = URLRequest(url: URL(string: "https://api.anthropic.com/v1/messages")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(key, forHTTPHeaderField: "x-api-key")
        request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")

        // Uses the cheapest available model for validation. Keep in sync
        // with AIProviderType.fallbackModels.
        let body: [String: Any] = [
            "model": "claude-haiku-4-5-20251001",
            "max_tokens": 1,
            "messages": [["role": "user", "content": "Hi"]],
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (_, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else { return false }
        return httpResponse.statusCode == 200
    }

    /// Encode messages for the Anthropic API, consolidating consecutive tool-result
    /// messages into a single ``user`` message with multiple ``tool_result`` content blocks.
    /// The Anthropic API requires strictly alternating user/assistant roles, so each
    /// tool-result message cannot be its own ``user`` message.
    private func encodeMessages(_ messages: [AIMessage]) -> [[String: Any]] {
        var encoded: [[String: Any]] = []
        var i = 0
        while i < messages.count {
            let message = messages[i]
            if message.role == .tool {
                // Gather all consecutive .tool messages into one user message
                var toolResultBlocks: [[String: Any]] = []
                while i < messages.count && messages[i].role == .tool {
                    toolResultBlocks.append([
                        "type": "tool_result",
                        "tool_use_id": messages[i].toolCallId ?? "",
                        "content": messages[i].content,
                    ])
                    i += 1
                }
                encoded.append([
                    "role": "user",
                    "content": toolResultBlocks,
                ])
            } else if let msg = encodeMessage(message) {
                encoded.append(msg)
                i += 1
            } else {
                i += 1
            }
        }
        return encoded
    }

    private func encodeMessage(_ message: AIMessage) -> [String: Any]? {
        switch message.role {
        case .system:
            return nil
        case .user:
            return ["role": "user", "content": message.content]
        case .assistant:
            if let toolCalls = message.toolCalls, !toolCalls.isEmpty {
                var content: [[String: Any]] = []
                if !message.content.isEmpty {
                    content.append(["type": "text", "text": message.content])
                }
                for tc in toolCalls {
                    content.append([
                        "type": "tool_use",
                        "id": tc.id,
                        "name": tc.name,
                        "input": tc.arguments.mapValues(\.anyValue),
                    ])
                }
                return ["role": "assistant", "content": content]
            }
            return ["role": "assistant", "content": message.content]
        case .tool:
            // Should not be reached when using encodeMessages, but kept for safety
            return [
                "role": "user",
                "content": [
                    [
                        "type": "tool_result",
                        "tool_use_id": message.toolCallId ?? "",
                        "content": message.content,
                    ],
                ],
            ]
        }
    }

    private func parseResponse(_ data: Data) throws -> AIResponse {
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw AIProviderError.invalidResponse("Invalid JSON")
        }

        let stopReason: AIResponse.StopReason
        let stopReasonStr = json["stop_reason"] as? String ?? ""
        switch stopReasonStr {
        case "tool_use": stopReason = .toolUse
        case "max_tokens": stopReason = .maxTokens
        default: stopReason = .endTurn
        }

        var textContent = ""
        var toolCalls: [ToolCall] = []

        if let content = json["content"] as? [[String: Any]] {
            for block in content {
                let type = block["type"] as? String ?? ""
                if type == "text" {
                    textContent += block["text"] as? String ?? ""
                } else if type == "tool_use" {
                    let id = block["id"] as? String ?? UUID().uuidString
                    let name = block["name"] as? String ?? ""
                    let inputAny = block["input"] as? [String: Any] ?? [:]
                    let input = inputAny.mapValues { JSONValue.from($0) }
                    toolCalls.append(ToolCall(id: id, name: name, arguments: input))
                }
            }
        }

        var usage: AIResponse.TokenUsage?
        if let usageDict = json["usage"] as? [String: Any] {
            let input = usageDict["input_tokens"] as? Int ?? 0
            let output = usageDict["output_tokens"] as? Int ?? 0
            usage = AIResponse.TokenUsage(inputTokens: input, outputTokens: output)
        }

        let message = AIMessage(
            role: .assistant,
            content: textContent,
            toolCalls: toolCalls.isEmpty ? nil : toolCalls
        )

        logger.info("Anthropic response: stopReason=\(stopReasonStr, privacy: .public), content=\(textContent.count) chars, toolCalls=\(toolCalls.count), inputTokens=\(usage?.inputTokens ?? 0), outputTokens=\(usage?.outputTokens ?? 0)")

        return AIResponse(message: message, stopReason: stopReason, usage: usage)
    }
}
