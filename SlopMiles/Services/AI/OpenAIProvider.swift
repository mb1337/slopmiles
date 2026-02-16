import Foundation
import os

private let logger = Logger(subsystem: "com.slopmiles", category: "ai")

struct OpenAICompatibleConfig: Sendable {
    let chatCompletionsURL: URL
    let validationURL: URL
    let validationMethod: String
    let extraHeaders: [String: String]
}

final class OpenAICompatibleProvider: AIProvider, @unchecked Sendable {
    private let session: URLSession
    private let apiKey: @Sendable () -> String?
    private let config: OpenAICompatibleConfig

    init(config: OpenAICompatibleConfig, apiKeyProvider: @escaping @Sendable () -> String?) {
        let sessionConfig = URLSessionConfiguration.default
        sessionConfig.timeoutIntervalForRequest = 120
        self.session = URLSession(configuration: sessionConfig)
        self.apiKey = apiKeyProvider
        self.config = config
    }

    static func openAI(apiKeyProvider: @escaping @Sendable () -> String?) -> OpenAICompatibleProvider {
        OpenAICompatibleProvider(
            config: OpenAICompatibleConfig(
                chatCompletionsURL: URL(string: "https://api.openai.com/v1/chat/completions")!,
                validationURL: URL(string: "https://api.openai.com/v1/models")!,
                validationMethod: "GET",
                extraHeaders: [:]
            ),
            apiKeyProvider: apiKeyProvider
        )
    }

    static func openRouter(apiKeyProvider: @escaping @Sendable () -> String?) -> OpenAICompatibleProvider {
        OpenAICompatibleProvider(
            config: OpenAICompatibleConfig(
                chatCompletionsURL: URL(string: "https://openrouter.ai/api/v1/chat/completions")!,
                validationURL: URL(string: "https://openrouter.ai/api/v1/auth/key")!,
                validationMethod: "GET",
                extraHeaders: [
                    "HTTP-Referer": "https://slopmiles.com",
                    "X-Title": "Slop Miles",
                ]
            ),
            apiKeyProvider: apiKeyProvider
        )
    }

    func sendMessages(
        _ messages: [AIMessage],
        systemPrompt: String,
        tools: [[String: JSONValue]],
        model: String
    ) async throws -> AIResponse {
        guard let key = apiKey() else { throw AIProviderError.invalidAPIKey }

        var request = URLRequest(url: config.chatCompletionsURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        for (header, value) in config.extraHeaders {
            request.setValue(value, forHTTPHeaderField: header)
        }

        var allMessages: [[String: Any]] = [
            ["role": "system", "content": systemPrompt],
        ]
        allMessages.append(contentsOf: messages.compactMap { encodeMessage($0) })

        var body: [String: Any] = [
            "model": model,
            "messages": allMessages,
            "max_tokens": 8192,
        ]
        if !tools.isEmpty {
            body["tools"] = tools.map { $0.mapValues(\.anyValue) }
        }

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        logger.info("OpenAI-compat request: url=\(self.config.chatCompletionsURL.absoluteString, privacy: .public), model=\(model, privacy: .public), messages=\(allMessages.count), tools=\(tools.count)")

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw AIProviderError.invalidResponse("Not an HTTP response")
        }

        if httpResponse.statusCode == 401 { throw AIProviderError.invalidAPIKey }
        if httpResponse.statusCode == 429 {
            let retry = httpResponse.value(forHTTPHeaderField: "retry-after").flatMap(Int.init)
            logger.error("OpenAI-compat rate limited, retry-after=\(retry ?? -1)")
            throw AIProviderError.rateLimited(retryAfter: retry)
        }

        guard httpResponse.statusCode == 200 else {
            let errorBody = String(data: data, encoding: .utf8) ?? "Unknown error"
            logger.error("OpenAI-compat HTTP \(httpResponse.statusCode): \(errorBody, privacy: .public)")
            throw AIProviderError.modelError("HTTP \(httpResponse.statusCode): \(errorBody)")
        }

        let rawBody = (String(data: data.prefix(2048), encoding: .utf8) ?? "<non-utf8>").trimmingCharacters(in: .whitespacesAndNewlines)
        logger.debug("OpenAI-compat raw response: \(rawBody, privacy: .public)")

        return try parseResponse(data)
    }

    func validateAPIKey(_ key: String) async throws -> Bool {
        var request = URLRequest(url: config.validationURL)
        request.httpMethod = config.validationMethod
        request.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        for (header, value) in config.extraHeaders {
            request.setValue(value, forHTTPHeaderField: header)
        }

        let (_, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else { return false }
        return httpResponse.statusCode == 200
    }

    private func encodeMessage(_ message: AIMessage) -> [String: Any]? {
        switch message.role {
        case .system:
            return nil
        case .user:
            return ["role": "user", "content": message.content]
        case .assistant:
            var msg: [String: Any] = ["role": "assistant"]
            if !message.content.isEmpty {
                msg["content"] = message.content
            }
            if let toolCalls = message.toolCalls, !toolCalls.isEmpty {
                msg["tool_calls"] = toolCalls.map { tc in
                    [
                        "id": tc.id,
                        "type": "function",
                        "function": [
                            "name": tc.name,
                            "arguments": (try? JSONSerialization.data(withJSONObject: tc.arguments.mapValues(\.anyValue)))
                                .flatMap { String(data: $0, encoding: .utf8) } ?? "{}",
                        ] as [String: Any],
                    ] as [String: Any]
                }
            }
            return msg
        case .tool:
            return [
                "role": "tool",
                "tool_call_id": message.toolCallId ?? "",
                "content": message.content,
            ]
        }
    }

    private func parseResponse(_ data: Data) throws -> AIResponse {
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let choices = json["choices"] as? [[String: Any]],
              let choice = choices.first,
              let messageDict = choice["message"] as? [String: Any] else {
            throw AIProviderError.invalidResponse("Missing choices in response")
        }

        let finishReason = choice["finish_reason"] as? String ?? ""
        if finishReason == "error" {
            let nativeReason = choice["native_finish_reason"] as? String ?? "unknown"
            logger.error("Model finished with error: \(nativeReason, privacy: .public)")
            throw AIProviderError.modelError("Model error (\(nativeReason)). The selected model may not support tool use properly.")
        }
        let stopReason: AIResponse.StopReason
        switch finishReason {
        case "tool_calls": stopReason = .toolUse
        case "length": stopReason = .maxTokens
        default: stopReason = .endTurn
        }

        let textContent = messageDict["content"] as? String ?? ""
        var toolCalls: [ToolCall] = []

        if let tcs = messageDict["tool_calls"] as? [[String: Any]] {
            for tc in tcs {
                let id = tc["id"] as? String ?? UUID().uuidString
                if let function = tc["function"] as? [String: Any] {
                    let name = function["name"] as? String ?? ""
                    let argsStr = function["arguments"] as? String ?? "{}"
                    let argsAny = (try? JSONSerialization.jsonObject(with: Data(argsStr.utf8))) as? [String: Any] ?? [:]
                    let args = argsAny.mapValues { JSONValue.from($0) }
                    toolCalls.append(ToolCall(id: id, name: name, arguments: args))
                }
            }
        }

        var usage: AIResponse.TokenUsage?
        if let usageDict = json["usage"] as? [String: Any] {
            let input = usageDict["prompt_tokens"] as? Int ?? 0
            let output = usageDict["completion_tokens"] as? Int ?? 0
            usage = AIResponse.TokenUsage(inputTokens: input, outputTokens: output)
        }

        let message = AIMessage(
            role: .assistant,
            content: textContent,
            toolCalls: toolCalls.isEmpty ? nil : toolCalls
        )

        logger.info("OpenAI-compat response: finishReason=\(finishReason, privacy: .public), content=\(textContent.count) chars, toolCalls=\(toolCalls.count), inputTokens=\(usage?.inputTokens ?? 0), outputTokens=\(usage?.outputTokens ?? 0)")

        return AIResponse(message: message, stopReason: stopReason, usage: usage)
    }
}
