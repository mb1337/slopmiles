import SwiftUI
import SwiftData

struct PlanDetailView: View {
    let plan: TrainingPlan
    @Environment(AppState.self) private var appState
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @Query private var profiles: [UserProfile]
    @Query private var schedules: [WeeklySchedule]
    @Query private var equipmentList: [RunnerEquipment]
    @Query private var aiSettings: [AISettings]
    @State private var errorMessage: String?
    @State private var showError = false

    private var unitPref: UnitPreference { profiles.first?.unitPreference ?? .metric }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Text(plan.goalDescription).font(.subheadline)
                    HStack(spacing: 16) {
                        Label("\(plan.totalWeeks) weeks", systemImage: "calendar")
                        Label(plan.difficulty.displayName, systemImage: "gauge.with.needle")
                    }
                    .font(.caption).foregroundStyle(.secondary)
                }
            }
            ForEach(plan.sortedWeeks) { week in
                Section("Week \(week.weekNumber) \u{2014} \(week.theme)") {
                    if week.workoutsGenerated {
                        ForEach(week.sortedWorkouts) { workout in
                            NavigationLink(value: workout) { WorkoutRowView(workout: workout, unitPref: unitPref) }
                        }
                    } else {
                        HStack {
                            Image(systemName: "sparkles")
                                .foregroundStyle(.secondary)
                            Text("Workouts not yet generated")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }
                    HStack {
                        Text(week.workoutsGenerated ? "Total" : "Target").foregroundStyle(.secondary)
                        Spacer()
                        if plan.volumeType == .time {
                            Text(UnitConverter.formatDuration(minutes: week.totalDurationMinutes)).foregroundStyle(.secondary)
                        } else {
                            Text(UnitConverter.formatDistance(week.totalDistanceKm, unit: unitPref)).foregroundStyle(.secondary)
                        }
                    }.font(.caption)
                }
                .swipeActions(edge: .trailing) {
                    if week.workoutsGenerated {
                        Button("Regenerate") {
                            regenerateWeek(week)
                        }
                        .tint(.orange)
                    }
                }
            }
        }
        .navigationTitle(plan.name)
        .navigationDestination(for: PlannedWorkout.self) { WorkoutDetailView(workout: $0) }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button("Schedule Next Week to Watch") {
                        if let week = plan.sortedWeeks.first(where: { $0.workoutsGenerated && $0.sortedWorkouts.contains { $0.completionStatus == .planned } }) {
                            Task {
                                do {
                                    try await appState.workoutKitService.scheduleWeek(week)
                                } catch {
                                    errorMessage = error.localizedDescription
                                    showError = true
                                }
                            }
                        }
                    }
                    Divider()
                    Button("Delete Plan", systemImage: "trash", role: .destructive) {
                        modelContext.delete(plan)
                        try? modelContext.save()
                        // Cancel notification if no other active plans
                        let descriptor = FetchDescriptor<TrainingPlan>()
                        let remaining = (try? modelContext.fetch(descriptor)) ?? []
                        if !remaining.contains(where: { $0.endDate >= Date() }) {
                            NotificationService.cancelWeeklyReminder()
                        }
                        dismiss()
                    }
                } label: { Image(systemName: "ellipsis.circle") }
            }
        }
        .alert("Scheduling Error", isPresented: $showError) {
            Button("OK") {}
        } message: {
            Text(errorMessage ?? "")
        }
    }

    private func regenerateWeek(_ week: TrainingWeek) {
        guard let profile = profiles.first,
              let schedule = schedules.first,
              let equipment = equipmentList.first,
              let settings = aiSettings.first else { return }

        appState.weekGenerationManager.regenerateWeek(
            week: week, plan: plan,
            profile: profile, schedule: schedule, equipment: equipment,
            settings: settings, aiService: appState.aiService, context: modelContext
        )
    }
}
