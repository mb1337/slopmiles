import SwiftUI
import SwiftData

struct SettingsView: View {
    @Environment(AppState.self) private var appState
    @Query private var aiSettings: [AISettings]
    @Query private var profiles: [UserProfile]
    @Environment(\.modelContext) private var modelContext

    private var settings: AISettings { aiSettings.first ?? AISettings() }
    private var profile: UserProfile { profiles.first ?? UserProfile() }

    var body: some View {
        NavigationStack {
            List {
                Section("AI Provider") {
                    Picker("Provider", selection: Binding(
                        get: { settings.provider },
                        set: { settings.provider = $0 }
                    )) {
                        ForEach(AIProviderType.allCases, id: \.self) { Text($0.displayName).tag($0) }
                    }

                    Picker("Model", selection: settings.provider == .anthropic ?
                           Binding(get: { settings.anthropicModel }, set: { settings.anthropicModel = $0 }) :
                           Binding(get: { settings.openAIModel }, set: { settings.openAIModel = $0 })) {
                        ForEach(settings.provider.availableModels, id: \.self) { Text($0).tag($0) }
                    }

                    NavigationLink("Update API Key") { APIKeySettingsView() }

                    HStack {
                        Text("API Key"); Spacer()
                        let hasKey = settings.provider == .anthropic
                            ? appState.keychainService.hasKey("anthropic_api_key")
                            : appState.keychainService.hasKey("openai_api_key")
                        Text(hasKey ? "Configured" : "Not Set")
                            .foregroundStyle(hasKey ? .green : .red)
                    }
                }

                Section("Profile") {
                    LabeledContent("Experience", value: profile.experienceLevel.displayName)
                    LabeledContent("Weekly Mileage", value: UnitConverter.formatDistance(profile.currentWeeklyMileageKm, unit: profile.unitPreference))
                    LabeledContent("Units", value: profile.unitPreference == .metric ? "Metric" : "Imperial")
                }

                Section("Health & Watch") {
                    HStack {
                        Text("HealthKit"); Spacer()
                        Text(appState.healthKitService.isAuthorized ? "Connected" : "Not Connected")
                            .foregroundStyle(appState.healthKitService.isAuthorized ? .green : .secondary)
                    }
                    if !appState.healthKitService.isAuthorized {
                        Button("Connect HealthKit") {
                            Task { await appState.healthKitService.requestAuthorization() }
                        }
                    }
                }

                Section("About") {
                    LabeledContent("Version", value: "1.0.0")
                    LabeledContent("License", value: "MIT")
                }
            }
            .navigationTitle("Settings")
        }
    }
}

struct APIKeySettingsView: View {
    @Environment(AppState.self) private var appState
    @Query private var aiSettings: [AISettings]
    @State private var apiKey = ""
    @State private var isValidating = false
    @State private var message: String?
    @State private var isError = false

    private var settings: AISettings { aiSettings.first ?? AISettings() }

    var body: some View {
        Form {
            Section { SecureField("API Key", text: $apiKey).textContentType(.password) }
            if let message {
                Section { Text(message).foregroundStyle(isError ? .red : .green).font(.caption) }
            }
            Section {
                Button {
                    Task { await validateAndSave() }
                } label: {
                    if isValidating { ProgressView() } else { Text("Validate & Save") }
                }
                .disabled(apiKey.isEmpty || isValidating)
            }
        }
        .navigationTitle("API Key")
    }

    private func validateAndSave() async {
        isValidating = true; message = nil
        do {
            let valid = try await appState.aiService.validateKey(provider: settings.provider, key: apiKey)
            if valid {
                let saved: Bool = switch settings.provider {
                case .anthropic: appState.keychainService.setAnthropicAPIKey(apiKey)
                case .openai: appState.keychainService.setOpenAIAPIKey(apiKey)
                }
                message = saved ? "API key saved successfully." : "Failed to save to Keychain."
                isError = !saved
            } else { message = "Invalid API key."; isError = true }
        } catch { message = error.localizedDescription; isError = true }
        isValidating = false
    }
}
