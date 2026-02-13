import SwiftUI
import SwiftData

struct GeneratePlanView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @Query private var profiles: [UserProfile]
    @Query private var schedules: [WeeklySchedule]
    @Query private var equipmentList: [RunnerEquipment]
    @Query private var aiSettings: [AISettings]

    @State private var goalDescription = ""
    @State private var selectedRaceDistance: Double?
    @State private var raceDate = Calendar.current.date(byAdding: .month, value: 3, to: Date()) ?? Date()
    @State private var startDate = Date()
    @State private var hasRace = true
    @State private var isGenerating = false
    @State private var errorMessage: String?
    @State private var generationTask: Task<Void, Never>?

    var body: some View {
        if let profile = profiles.first, let schedule = schedules.first,
           let equipment = equipmentList.first, let settings = aiSettings.first {
            Form {
                Section("Goal") {
                    Toggle("Training for a race", isOn: $hasRace)
                    if hasRace {
                        Picker("Distance", selection: $selectedRaceDistance) {
                            Text("Select").tag(nil as Double?)
                            ForEach(Constants.RaceDistances.all, id: \.meters) { Text($0.name).tag($0.meters as Double?) }
                        }
                        DatePicker("Race Date", selection: $raceDate, displayedComponents: .date)
                    }
                    TextField("Describe your goal", text: $goalDescription, axis: .vertical).lineLimit(2...4)
                }
                Section("Schedule") {
                    DatePicker("Start Date", selection: $startDate, displayedComponents: .date)
                    HStack {
                        Text("Duration"); Spacer()
                        let weeks = Calendar.current.dateComponents([.weekOfYear], from: startDate, to: hasRace ? raceDate : Calendar.current.date(byAdding: .month, value: 3, to: startDate)!).weekOfYear ?? 12
                        Text("\(weeks) weeks").foregroundStyle(.secondary)
                    }
                }
                Section("AI Coach") {
                    HStack { Text("Provider"); Spacer(); Text(settings.provider.displayName).foregroundStyle(.secondary) }
                    HStack { Text("Model"); Spacer(); Text(settings.selectedModel).foregroundStyle(.secondary) }
                }
                if isGenerating {
                    Section("Generating...") { GenerationProgressView(status: appState.aiService.generationStatus) }
                }
                if let error = errorMessage {
                    Section { Text(error).foregroundStyle(.red).font(.caption) }
                }
            }
            .navigationTitle("New Plan")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button("Generate") {
                        generationTask = Task { await generate(profile: profile, schedule: schedule, equipment: equipment, settings: settings) }
                    }.disabled(isGenerating || goalDescription.isEmpty)
                }
            }
        .onDisappear {
            generationTask?.cancel()
            generationTask = nil
        }
        } else {
            ProgressView("Loading profile...")
                .navigationTitle("New Plan")
                .task { ensureModelsExist() }
        }
    }

    private func ensureModelsExist() {
        if profiles.first == nil { modelContext.insert(UserProfile()) }
        if schedules.first == nil { modelContext.insert(WeeklySchedule()) }
        if equipmentList.first == nil { modelContext.insert(RunnerEquipment()) }
        if aiSettings.first == nil { modelContext.insert(AISettings()) }
    }

    private func generate(profile: UserProfile, schedule: WeeklySchedule, equipment: RunnerEquipment, settings: AISettings) async {
        isGenerating = true; errorMessage = nil
        let endDate = hasRace ? raceDate : Calendar.current.date(byAdding: .month, value: 3, to: startDate)!
        let stats: RunningStats = appState.healthKitService.isAuthorized ? await appState.healthKitService.fetchRunningStats() : RunningStats()
        do {
            let responseText = try await appState.aiService.generatePlan(profile: profile, schedule: schedule, equipment: equipment, stats: stats, settings: settings, goalDescription: goalDescription, raceDistance: selectedRaceDistance, raceDate: hasRace ? raceDate : nil, startDate: startDate, endDate: endDate)
            let plan = try ResponseParser.parsePlan(from: responseText, startDate: startDate, context: modelContext)
            plan.goalDescription = goalDescription; plan.raceDistance = selectedRaceDistance; plan.raceDate = hasRace ? raceDate : nil
            try modelContext.save(); dismiss()
        } catch is CancellationError {
            // Task was cancelled (e.g. user navigated away), no error to show
        } catch { errorMessage = error.localizedDescription }
        isGenerating = false
    }
}

struct GenerationProgressView: View {
    let status: GenerationStatus
    var body: some View {
        HStack(spacing: 12) {
            ProgressView()
            switch status {
            case .starting: Text("Starting...")
            case .sendingToAI: Text("Thinking...")
            case .executingTool(let name): Text("Running \(toolDisplayName(name))...")
            case .parsingResponse: Text("Building plan...")
            case .complete: Text("Done!")
            case .failed(let msg): Text("Error: \(msg)").foregroundStyle(.red)
            }
        }
        .font(.subheadline)
    }
    private func toolDisplayName(_ name: String) -> String {
        switch name {
        case "calculate_vdot": return "VDOT Calculator"
        case "get_training_paces": return "Pace Calculator"
        case "project_race_time": return "Race Predictor"
        case "calculate_hr_zones": return "HR Zone Calculator"
        case "check_mileage_progression": return "Mileage Checker"
        case "get_weather_forecast": return "Weather Forecast"
        default: return name
        }
    }
}
