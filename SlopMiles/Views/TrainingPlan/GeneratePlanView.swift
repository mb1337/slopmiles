import SwiftUI
import SwiftData

struct GeneratePlanView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.modelContext) private var modelContext
    @Query private var profiles: [UserProfile]
    @Query private var schedules: [WeeklySchedule]
    @Query private var equipmentList: [RunnerEquipment]
    @Query private var aiSettings: [AISettings]

    @State private var goalDescription = ""
    @State private var selectedRaceDistance: Double?
    @State private var raceDate = Calendar.current.date(byAdding: .month, value: 3, to: Date()) ?? Date()
    @State private var startDate = Date()
    @State private var hasRace = true
    @State private var planWeeks = 12
    @State private var userResponse = ""

    private var manager: PlanGenerationManager { appState.planGenerationManager }

    private var isWaitingForInput: Bool {
        if case .waitingForInput = appState.aiService.generationStatus { return true }
        return false
    }

    var body: some View {
        if let profile = profiles.first, let schedule = schedules.first,
           let equipment = equipmentList.first, let settings = aiSettings.first {
            ScrollViewReader { scrollProxy in
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
                        if hasRace {
                            HStack {
                                Text("Duration"); Spacer()
                                let weeks = Calendar.current.dateComponents([.weekOfYear], from: startDate, to: raceDate).weekOfYear ?? 12
                                Text("\(weeks) weeks").foregroundStyle(.secondary)
                            }
                        } else {
                            Stepper("Duration: \(planWeeks) weeks", value: $planWeeks, in: 4...52)
                        }
                    }
                    Section("AI Coach") {
                        HStack { Text("Provider"); Spacer(); Text(settings.provider.displayName).foregroundStyle(.secondary) }
                        HStack { Text("Model"); Spacer(); Text(settings.selectedModel).foregroundStyle(.secondary) }
                    }
                    if manager.isGenerating {
                        Section("Generating...") { GenerationProgressView(status: appState.aiService.generationStatus) }
                        if case .waitingForInput(let question) = appState.aiService.generationStatus {
                            Section("AI Question") {
                                Text(question)
                                TextField("Your response", text: $userResponse, axis: .vertical)
                                    .lineLimit(2...4)
                                Button("Send") {
                                    appState.aiService.submitUserResponse(userResponse)
                                    userResponse = ""
                                }
                                .disabled(userResponse.isEmpty)
                            }
                            .id("aiQuestion")
                        }
                    }
                    if let error = manager.errorMessage {
                        Section { Text(error).foregroundStyle(.red).font(.caption) }
                    }
                }
                .onChange(of: isWaitingForInput) {
                    if isWaitingForInput {
                        withAnimation {
                            scrollProxy.scrollTo("aiQuestion", anchor: .bottom)
                        }
                    }
                }
            }
            .navigationTitle("New Plan")
            .toolbar {
                if manager.isGenerating {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel", role: .cancel) {
                            manager.cancel(aiService: appState.aiService)
                        }
                    }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button("Generate") {
                        manager.startGeneration(
                            profile: profile, schedule: schedule,
                            equipment: equipment, settings: settings,
                            goalDescription: goalDescription,
                            raceDistance: selectedRaceDistance,
                            raceDate: hasRace ? raceDate : nil,
                            hasRace: hasRace,
                            startDate: startDate, planWeeks: planWeeks,
                            aiService: appState.aiService,
                            healthKitService: appState.healthKitService,
                            workoutKitService: appState.workoutKitService,
                            context: modelContext
                        )
                    }.disabled(manager.isGenerating || goalDescription.isEmpty)
                }
            }
            .onDisappear {
                // Auto-respond to pending AI question so generation doesn't hang,
                // but do NOT cancel the task — let it finish in the background
                if manager.isGenerating {
                    appState.aiService.cancelPendingInput()
                }
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
}

struct GenerationProgressView: View {
    let status: GenerationStatus
    private var isInProgress: Bool {
        switch status {
        case .starting, .sendingToAI, .executingTool, .generatingOutline, .generatingWeek, .parsingResponse: return true
        case .waitingForInput, .complete, .failed: return false
        }
    }

    var body: some View {
        HStack(spacing: 12) {
            if isInProgress {
                ProgressView()
            }
            switch status {
            case .starting: Text("Starting...")
            case .sendingToAI: Text("Thinking...")
            case .executingTool(let name): Text("Running \(toolDisplayName(name))...")
            case .generatingOutline: Text("Generating plan outline...")
            case .generatingWeek(let n): Text("Generating week \(n) workouts...")
            case .parsingResponse: Text("Building plan...")
            case .waitingForInput: Text("Waiting for your response...")
            case .complete: Text("Done!")
            case .failed(let msg): Text("Error: \(msg)").foregroundStyle(.red)
            }
        }
        .font(.subheadline)
    }
    private func toolDisplayName(_ name: String) -> String {
        switch name {
        case "calculate_vdot": return "VDOT Calculator"
        case "project_race_time": return "Race Predictor"
        case "calculate_hr_zones": return "HR Zone Calculator"
        case "check_mileage_progression": return "Mileage Checker"
        default: return name
        }
    }
}
