import SwiftUI
import SwiftData

struct WorkoutDetailView: View {
    let workout: PlannedWorkout
    @Environment(AppState.self) private var appState
    @Query private var profiles: [UserProfile]
    @State private var errorMessage: String?
    @State private var showError = false

    private var unitPref: UnitPreference { profiles.first?.unitPreference ?? .metric }

    var body: some View {
        List {
            Section {
                HStack {
                    Image(systemName: workout.workoutType.iconName).font(.title2).foregroundStyle(.blue)
                    VStack(alignment: .leading) {
                        Text(workout.workoutType.displayName).font(.caption).foregroundStyle(.secondary)
                        Text(DateFormatters.shortDate.string(from: workout.scheduledDate)).font(.caption).foregroundStyle(.secondary)
                    }
                }
                if workout.distanceKm > 0 { LabeledContent("Distance", value: UnitConverter.formatDistance(workout.distanceKm, unit: unitPref)) }
                if workout.durationMinutes > 0 { LabeledContent("Duration", value: UnitConverter.formatDuration(minutes: workout.durationMinutes)) }
                if let pace = workout.targetPaceMinPerKm { LabeledContent("Target Pace", value: UnitConverter.formatPace(pace, unit: unitPref)) }
                LabeledContent("Location", value: workout.location.rawValue.capitalized)
            }
            if !workout.sortedSteps.isEmpty {
                Section("Workout Steps") {
                    ForEach(workout.sortedSteps) { step in
                        HStack {
                            Group {
                                switch step.stepType {
                                case .warmup: Image(systemName: "flame.fill").foregroundStyle(.orange)
                                case .work: Image(systemName: "bolt.fill").foregroundStyle(.red)
                                case .recovery: Image(systemName: "heart.fill").foregroundStyle(.green)
                                case .cooldown: Image(systemName: "snowflake").foregroundStyle(.cyan)
                                }
                            }
                            .frame(width: 28)
                            VStack(alignment: .leading, spacing: 2) {
                                HStack {
                                    Text(step.name.isEmpty ? step.stepType.rawValue.capitalized : step.name).font(.subheadline)
                                    if step.repeatCount > 1 { Text("x\(step.repeatCount)").font(.caption.bold()).foregroundStyle(.blue) }
                                }
                                HStack(spacing: 8) {
                                    if let v = step.goalValue {
                                        if step.goalType == .distance { Text(UnitConverter.formatDistance(v / 1000, unit: unitPref)) }
                                        else if step.goalType == .time { Text(UnitConverter.formatDuration(minutes: v / 60)) }
                                    }
                                    if let p = step.targetPaceMinPerKm { Text(UnitConverter.formatPace(p, unit: unitPref)) }
                                    if let z = step.hrZone { Text("Zone \(z)") }
                                }
                                .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            if !workout.notes.isEmpty { Section("Notes") { Text(workout.notes).font(.subheadline) } }
            Section {
                if workout.completionStatus == .planned {
                    Button("Schedule to Watch") {
                        Task {
                            do {
                                try await appState.workoutKitService.scheduleWorkout(workout)
                            } catch {
                                errorMessage = error.localizedDescription
                                showError = true
                            }
                        }
                    }
                }
                if workout.completionStatus == .planned || workout.completionStatus == .scheduled {
                    Button("Mark as Completed") { workout.completionStatus = .completed }
                    Button("Skip Workout") { workout.completionStatus = .skipped }.foregroundStyle(.orange)
                }
            }
        }
        .navigationTitle(workout.name)
        .alert("Scheduling Error", isPresented: $showError) {
            Button("OK") {}
        } message: {
            Text(errorMessage ?? "")
        }
    }
}
