import SwiftUI
import SwiftData

struct SettingsView: View {
    @Environment(AppState.self) private var appState
    @Query private var aiSettings: [AISettings]
    @Query private var profiles: [UserProfile]
    @Query private var schedules: [WeeklySchedule]

    var body: some View {
        NavigationStack {
            if let settings = aiSettings.first, let profile = profiles.first {
                List {
                    Section("AI Provider") {
                        Picker("Provider", selection: Binding(
                            get: { settings.provider },
                            set: { settings.provider = $0 }
                        )) {
                            ForEach(AIProviderType.allCases, id: \.self) { Text($0.displayName).tag($0) }
                        }

                        Picker("Model", selection: modelBinding(for: settings)) {
                            ForEach(settings.provider.availableModels, id: \.self) { Text($0).tag($0) }
                        }

                        NavigationLink("Update API Key") { APIKeySettingsView() }

                        HStack {
                            Text("API Key"); Spacer()
                            let hasKey = appState.keychainService.hasKey(settings.provider.keychainKey)
                            Text(hasKey ? "Configured" : "Not Set")
                                .foregroundStyle(hasKey ? .green : .red)
                        }
                    }

                    Section("Profile") {
                        NavigationLink {
                            ProfileEditView()
                        } label: {
                            LabeledContent("Runner Profile", value: profile.experienceLevel.displayName)
                        }
                        NavigationLink {
                            ScheduleEditView()
                        } label: {
                            LabeledContent("Weekly Schedule", value: "\(schedules.first?.availableDays.count ?? 0) days")
                        }
                        NavigationLink {
                            EquipmentEditView()
                        } label: {
                            Text("Equipment & Facilities")
                        }
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
            } else {
                // Singleton models are seeded at app launch; this shows briefly on first launch.
                ProgressView("Loading settings...")
                    .navigationTitle("Settings")
            }
        }
    }

    private func modelBinding(for settings: AISettings) -> Binding<String> {
        switch settings.provider {
        case .anthropic: Binding(get: { settings.anthropicModel }, set: { settings.anthropicModel = $0 })
        case .openai: Binding(get: { settings.openAIModel }, set: { settings.openAIModel = $0 })
        case .openRouter: Binding(get: { settings.openRouterModel }, set: { settings.openRouterModel = $0 })
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

    var body: some View {
        if let settings = aiSettings.first {
            Form {
                Section { SecureField("API Key", text: $apiKey).textContentType(.password) }
                if let message {
                    Section { Text(message).foregroundStyle(isError ? .red : .green).font(.caption) }
                }
                Section {
                    Button {
                        Task { await validateAndSave(settings: settings) }
                    } label: {
                        if isValidating { ProgressView() } else { Text("Validate & Save") }
                    }
                    .disabled(apiKey.isEmpty || isValidating)
                }
            }
            .navigationTitle("API Key")
        } else {
            ContentUnavailableView("Settings Not Found", systemImage: "gear.badge.xmark", description: Text("AI settings are not configured yet."))
                .navigationTitle("API Key")
        }
    }

    private func validateAndSave(settings: AISettings) async {
        isValidating = true; message = nil
        do {
            let valid = try await appState.aiService.validateKey(provider: settings.provider, key: apiKey)
            if valid {
                let saved = appState.keychainService.save(key: settings.provider.keychainKey, value: apiKey)
                message = saved ? "API key saved successfully." : "Failed to save to Keychain."
                isError = !saved
            } else { message = "Invalid API key."; isError = true }
        } catch { message = error.localizedDescription; isError = true }
        isValidating = false
    }
}
