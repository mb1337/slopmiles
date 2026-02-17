import SwiftUI
import SwiftData

struct APIKeyStepView: View {
    let onContinue: () -> Void
    @Environment(AppState.self) private var appState
    @Query private var aiSettings: [AISettings]

    @State private var selectedProvider: AIProviderType = .anthropic
    @State private var apiKey = ""
    @State private var isValidating = false
    @State private var validationError: String?
    @State private var isValid = false

    /// Read-only access to the singleton AISettings seeded at app launch.
    private var settings: AISettings? {
        aiSettings.first
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                VStack(spacing: 8) {
                    Text("AI Provider").font(.title2.bold())
                    Text("Choose your AI provider and enter your API key.")
                        .font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
                }
                .padding(.top, 32)

                Picker("Provider", selection: $selectedProvider) {
                    ForEach(AIProviderType.allCases, id: \.self) { provider in
                        Text(provider.displayName).tag(provider)
                    }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)
                .onChange(of: selectedProvider) { apiKey = ""; isValid = false; validationError = nil }

                VStack(alignment: .leading, spacing: 8) {
                    Text("API Key").font(.subheadline.bold())
                    SecureField("Enter your \(selectedProvider.displayName) API key", text: $apiKey)
                        .textFieldStyle(.roundedBorder).textContentType(.password).autocorrectionDisabled()
                    if let error = validationError {
                        Text(error).font(.caption).foregroundStyle(.red)
                    }
                    if isValid {
                        Label("API key is valid", systemImage: "checkmark.circle.fill")
                            .font(.caption).foregroundStyle(.green)
                    }
                }
                .padding(.horizontal)

                if let settings {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Model").font(.subheadline.bold())
                        if selectedProvider == .openRouter {
                            OpenRouterModelPicker(selection: modelBinding(for: settings))
                        } else {
                            Picker("Model", selection: modelBinding(for: settings)) {
                                ForEach(selectedProvider.fallbackModels, id: \.self) { model in
                                    Text(model).tag(model)
                                }
                            }
                            .pickerStyle(.menu)
                        }
                    }
                    .padding(.horizontal)
                }

                Spacer()

                VStack(spacing: 12) {
                    Button {
                        Task { await validateAndSave() }
                    } label: {
                        if isValidating { ProgressView().frame(maxWidth: .infinity) }
                        else { Text("Validate & Save").frame(maxWidth: .infinity) }
                    }
                    .buttonStyle(.borderedProminent).controlSize(.large)
                    .disabled(apiKey.isEmpty || isValidating)

                    Button("Continue", action: onContinue)
                        .controlSize(.large).disabled(!isValid)
                }
                .padding(.horizontal)
                .padding(.bottom, 32)
            }
        }
    }

    private func modelBinding(for settings: AISettings) -> Binding<String> {
        switch selectedProvider {
        case .anthropic: Binding(get: { settings.anthropicModel }, set: { settings.anthropicModel = $0 })
        case .openai: Binding(get: { settings.openAIModel }, set: { settings.openAIModel = $0 })
        case .openRouter: Binding(get: { settings.openRouterModel }, set: { settings.openRouterModel = $0 })
        }
    }

    private func validateAndSave() async {
        isValidating = true
        validationError = nil
        do {
            let valid = try await appState.aiService.validateKey(provider: selectedProvider, key: apiKey)
            if valid {
                let saved = appState.keychainService.save(key: selectedProvider.keychainKey, value: apiKey)
                if saved {
                    settings?.provider = selectedProvider; isValid = true
                    if selectedProvider == .openRouter {
                        appState.openRouterModelService.invalidateCache()
                        await appState.openRouterModelService.fetchModels(apiKey: apiKey)
                    }
                }
                else { validationError = "Failed to save API key to Keychain." }
            } else { validationError = "API key validation failed." }
        } catch { validationError = error.localizedDescription }
        isValidating = false
    }
}

#Preview {
    APIKeyStepView(onContinue: {})
        .environment(PreviewData.appState)
        .modelContainer(PreviewData.container)
}
