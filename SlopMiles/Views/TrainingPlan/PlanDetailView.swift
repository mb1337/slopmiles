import SwiftUI
import SwiftData

struct PlanDetailView: View {
    let plan: TrainingPlan
    @Environment(AppState.self) private var appState
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @Query private var profiles: [UserProfile]
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
                    ForEach(week.sortedWorkouts) { workout in
                        NavigationLink(value: workout) { WorkoutRowView(workout: workout, unitPref: unitPref) }
                    }
                    HStack { Text("Total").foregroundStyle(.secondary); Spacer(); Text(UnitConverter.formatDistance(week.totalDistanceKm, unit: unitPref)).foregroundStyle(.secondary) }.font(.caption)
                }
            }
        }
        .navigationTitle(plan.name)
        .navigationDestination(for: PlannedWorkout.self) { WorkoutDetailView(workout: $0) }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button("Schedule Next Week to Watch") {
                        if let week = plan.sortedWeeks.first(where: { $0.sortedWorkouts.contains { $0.completionStatus == .planned } }) {
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
}
