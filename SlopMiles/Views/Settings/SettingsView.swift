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

                        if settings.provider == .openRouter {
                            OpenRouterModelPicker(selection: modelBinding(for: settings))
                        } else {
                            Picker("Model", selection: modelBinding(for: settings)) {
                                ForEach(settings.provider.fallbackModels, id: \.self) { Text($0).tag($0) }
                            }
                        }

                        NavigationLink("Update API Key") { APIKeySettingsView() }

                        HStack {
                            Text("API Key"); Spacer()
                            let hasKey = appState.keychainService.hasKey(settings.provider.keychainKey)
                            Label(hasKey ? "Configured" : "Not Set",
                                  systemImage: hasKey ? "checkmark.circle.fill" : "xmark.circle")
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
                        Picker("First Day of Week", selection: Binding(
                            get: { profile.firstDayOfWeekRaw },
                            set: { newValue in
                                profile.firstDayOfWeekRaw = newValue
                                NotificationService.scheduleWeeklyReminder(firstDayOfWeek: profile.firstDayOfWeek)
                            }
                        )) {
                            Text("System Default").tag(0)
                            Text("Sunday").tag(1)
                            Text("Monday").tag(2)
                            Text("Saturday").tag(7)
                        }
                    }

                    Section("Location") {
                        HStack {
                            Text("Location"); Spacer()
                            Label(appState.locationService.isAuthorized ? "Connected" : "Not Connected",
                                  systemImage: appState.locationService.isAuthorized ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(appState.locationService.isAuthorized ? .green : .secondary)
                        }
                        if appState.locationService.isAuthorized {
                            if let lat = profile.homeLatitude, let lon = profile.homeLongitude {
                                LabeledContent("Coordinates", value: String(format: "%.2f, %.2f", lat, lon))
                            }
                            Button("Update Location") {
                                Task { await appState.locationService.updateProfileLocation(profile) }
                            }
                        } else {
                            Button("Enable Location") {
                                Task { await appState.locationService.requestLocationPermission() }
                            }
                        }
                    }

                    Section("Health & Watch") {
                        HStack {
                            Text("HealthKit"); Spacer()
                            Label(appState.healthKitService.isAuthorized ? "Connected" : "Not Connected",
                                  systemImage: appState.healthKitService.isAuthorized ? "checkmark.circle.fill" : "circle")
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
                if saved && settings.provider == .openRouter {
                    appState.openRouterModelService.invalidateCache()
                    await appState.openRouterModelService.fetchModels(apiKey: apiKey)
                }
            } else { message = "Invalid API key."; isError = true }
        } catch { message = error.localizedDescription; isError = true }
        isValidating = false
    }
}

struct OpenRouterModelPicker: View {
    @Environment(AppState.self) private var appState
    @Binding var selection: String
    @State private var showingPicker = false

    var body: some View {
        let service = appState.openRouterModelService
        Button {
            showingPicker = true
        } label: {
            HStack {
                Text("Model")
                    .foregroundStyle(.primary)
                Spacer()
                if service.isLoading && service.models.isEmpty {
                    ProgressView()
                } else {
                    let displayName = service.models.first(where: { $0.id == selection })?.name ?? selection
                    Text(displayName)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
        }
        .buttonStyle(.plain)
        .task {
            guard service.models.isEmpty else { return }
            if let key = appState.keychainService.read(key: AIProviderType.openRouter.keychainKey) {
                await service.fetchModels(apiKey: key)
            }
        }
        .sheet(isPresented: $showingPicker) {
            OpenRouterModelListView(
                selection: $selection,
                models: service.models.isEmpty
                    ? AIProviderType.openRouter.fallbackModels.map {
                        OpenRouterModel(id: $0, name: $0, contextLength: 0, promptPricing: "", completionPricing: "")
                    }
                    : service.models
            )
        }
        if let error = service.lastError {
            Text(error).font(.caption2).foregroundStyle(.secondary)
        }
    }
}

private struct OpenRouterModelListView: View {
    @Binding var selection: String
    let models: [OpenRouterModel]
    @Environment(\.dismiss) private var dismiss
    @State private var searchText = ""

    private var filteredModels: [OpenRouterModel] {
        if searchText.isEmpty { return models }
        return models.filter { $0.name.localizedCaseInsensitiveContains(searchText) || $0.id.localizedCaseInsensitiveContains(searchText) }
    }

    var body: some View {
        NavigationStack {
            List(filteredModels) { model in
                Button {
                    selection = model.id
                    dismiss()
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(model.name)
                                .foregroundStyle(.primary)
                            if !model.promptPricing.isEmpty {
                                Text("In: \(model.promptPricing) · Out: \(model.completionPricing) per 1M tokens")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        Spacer()
                        if model.id == selection {
                            Image(systemName: "checkmark")
                                .foregroundStyle(.tint)
                        }
                    }
                }
            }
            .searchable(text: $searchText, prompt: "Search models")
            .navigationTitle("Select Model")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
