import Foundation
import os

struct OpenRouterModel: Sendable, Identifiable {
    var id: String
    var name: String
    var contextLength: Int
    var promptPricing: String
    var completionPricing: String
}

private let logger = Logger(subsystem: "com.slopmiles", category: "openrouter-models")

@Observable
@MainActor
final class OpenRouterModelService {
    var models: [OpenRouterModel] = []
    var isLoading = false
    var lastError: String?

    private var cachedModels: [OpenRouterModel]?
    private var cacheTimestamp: Date?
    private static let cacheDuration: TimeInterval = 300 // 5 minutes

    func fetchModels(apiKey: String) async {
        if let cached = cachedModels, let timestamp = cacheTimestamp,
           Date().timeIntervalSince(timestamp) < Self.cacheDuration {
            models = cached
            return
        }

        isLoading = true
        lastError = nil

        do {
            var request = URLRequest(url: URL(string: "https://openrouter.ai/api/v1/models")!)
            request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")

            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                throw OpenRouterModelError.httpError(status)
            }

            let decoded = try JSONDecoder().decode(OpenRouterModelsResponse.self, from: data)

            let filtered = decoded.data
                .filter { model in
                    model.supported_parameters?.contains("tools") == true
                }
                .compactMap { model -> OpenRouterModel? in
                    guard let pricing = model.pricing else { return nil }
                    return OpenRouterModel(
                        id: model.id,
                        name: model.name,
                        contextLength: model.context_length ?? 0,
                        promptPricing: Self.formatPricing(pricing.prompt),
                        completionPricing: Self.formatPricing(pricing.completion)
                    )
                }
                .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }

            cachedModels = filtered
            cacheTimestamp = Date()
            models = filtered

            logger.info("Fetched \(filtered.count) OpenRouter models with tool support")
        } catch {
            lastError = error.localizedDescription
            logger.error("Failed to fetch OpenRouter models: \(error)")
        }

        isLoading = false
    }

    func invalidateCache() {
        cachedModels = nil
        cacheTimestamp = nil
    }

    /// Converts a per-token price string (e.g. "0.000003") to a per-1M-tokens display string (e.g. "$3.00").
    static func formatPricing(_ perToken: String?) -> String {
        guard let perToken, let value = Double(perToken) else { return "N/A" }
        let perMillion = value * 1_000_000
        if perMillion == 0 { return "Free" }
        if perMillion < 0.01 { return "<$0.01" }
        return String(format: "$%.2f", perMillion)
    }
}

private enum OpenRouterModelError: LocalizedError {
    case httpError(Int)

    var errorDescription: String? {
        switch self {
        case .httpError(let code): "OpenRouter API returned HTTP \(code)"
        }
    }
}

// MARK: - API Response Types

private struct OpenRouterModelsResponse: Decodable {
    let data: [OpenRouterAPIModel]
}

private struct OpenRouterAPIModel: Decodable {
    let id: String
    let name: String
    let context_length: Int?
    let pricing: OpenRouterPricing?
    let supported_parameters: [String]?
}

private struct OpenRouterPricing: Decodable {
    let prompt: String?
    let completion: String?
}
