import SwiftUI
import SwiftData

struct DashboardView: View {
    @Environment(AppState.self) private var appState
    @Query(sort: \TrainingPlan.createdAt, order: .reverse) private var plans: [TrainingPlan]
    @Query private var profiles: [UserProfile]

    private var activePlan: TrainingPlan? {
        plans.first { $0.endDate >= Date() }
    }

    private var currentWeek: TrainingWeek? {
        guard let plan = activePlan else { return nil }
        let now = Date()
        let calendar = Calendar.current
        return plan.sortedWeeks.first { week in
            guard let first = week.sortedWorkouts.first, let last = week.sortedWorkouts.last else { return false }
            let start = calendar.startOfDay(for: first.scheduledDate)
            let end = calendar.date(byAdding: .day, value: 1, to: last.scheduledDate) ?? last.scheduledDate
            return now >= start && now < end
        }
    }

    private var nextWorkout: PlannedWorkout? {
        currentWeek?.sortedWorkouts.first { $0.completionStatus == .planned || $0.completionStatus == .scheduled }
    }

    private var unitPref: UnitPreference { profiles.first?.unitPreference ?? .metric }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    if let plan = activePlan, let week = currentWeek {
                        CurrentPlanCard(plan: plan, week: week, unitPref: unitPref)
                        if let workout = nextWorkout {
                            NextWorkoutCard(workout: workout, unitPref: unitPref)
                        }
                        WeekOverviewCard(week: week, unitPref: unitPref)
                    } else {
                        EmptyDashboardView()
                    }
                }
                .padding()
            }
            .navigationTitle("Dashboard")
        }
    }
}

private struct CurrentPlanCard: View {
    let plan: TrainingPlan
    let week: TrainingWeek
    let unitPref: UnitPreference

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(plan.name).font(.headline)
                Spacer()
                Text("Week \(week.weekNumber) of \(plan.totalWeeks)").font(.caption).foregroundStyle(.secondary)
            }
            if !week.theme.isEmpty {
                Text(week.theme).font(.subheadline).foregroundStyle(.blue)
            }
            HStack(spacing: 20) {
                if plan.volumeType == .time {
                    VStack(spacing: 4) { Text(UnitConverter.formatDuration(minutes: week.totalDurationMinutes)).font(.headline); Text("Duration").font(.caption2).foregroundStyle(.secondary) }
                } else {
                    VStack(spacing: 4) { Text(UnitConverter.formatDistance(week.totalDistanceKm, unit: unitPref)).font(.headline); Text("Distance").font(.caption2).foregroundStyle(.secondary) }
                }
                VStack(spacing: 4) { Text("\(week.sortedWorkouts.filter { $0.workoutType != .rest }.count)").font(.headline); Text("Workouts").font(.caption2).foregroundStyle(.secondary) }
                let completed = week.sortedWorkouts.filter { $0.completionStatus == .completed }.count
                let total = week.sortedWorkouts.filter { $0.workoutType != .rest }.count
                VStack(spacing: 4) { Text("\(completed)/\(total)").font(.headline); Text("Done").font(.caption2).foregroundStyle(.secondary) }
            }
        }
        .padding()
        .background(.fill.quaternary, in: RoundedRectangle(cornerRadius: 16))
    }
}

private struct NextWorkoutCard: View {
    let workout: PlannedWorkout
    let unitPref: UnitPreference
    @Environment(AppState.self) private var appState
    @State private var errorMessage: String?
    @State private var showError = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: workout.workoutType.iconName).foregroundStyle(.blue)
                Text("Next Workout").font(.caption.bold()).foregroundStyle(.secondary)
                Spacer()
                Text(DateFormatters.shortDate(from: workout.scheduledDate)).font(.caption).foregroundStyle(.secondary)
            }
            Text(workout.name).font(.title3.bold())
            HStack(spacing: 16) {
                if workout.distanceKm > 0 { Label(UnitConverter.formatDistance(workout.distanceKm, unit: unitPref), systemImage: "ruler").font(.subheadline) }
                if workout.durationMinutes > 0 { Label(UnitConverter.formatDuration(minutes: workout.durationMinutes), systemImage: "clock").font(.subheadline) }
                if let pace = workout.targetPaceMinPerKm { Label(UnitConverter.formatPace(pace, unit: unitPref), systemImage: "gauge.with.needle").font(.subheadline) }
            }
            .foregroundStyle(.secondary)
            if workout.completionStatus != .scheduled {
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
                    .buttonStyle(.borderedProminent).controlSize(.small)
                    .accessibilityLabel("Schedule \(workout.name) to Apple Watch")
            } else {
                Label("Scheduled on Watch", systemImage: "applewatch").font(.caption).foregroundStyle(.green)
            }
        }
        .padding()
        .background(.fill.quaternary, in: RoundedRectangle(cornerRadius: 16))
        .alert("Scheduling Error", isPresented: $showError) {
            Button("OK") {}
        } message: {
            Text(errorMessage ?? "")
        }
    }
}

private struct WeekOverviewCard: View {
    let week: TrainingWeek
    let unitPref: UnitPreference

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("This Week").font(.headline)
            ForEach(week.sortedWorkouts) { workout in
                HStack {
                    Image(systemName: workout.workoutType.iconName).foregroundStyle(.blue).frame(width: 24)
                    VStack(alignment: .leading) {
                        Text(workout.name).font(.subheadline)
                        Text(DateFormatters.shortDayOfWeek(from: workout.scheduledDate)).font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    if (week.plan?.volumeType ?? .distance) == .time {
                        if workout.durationMinutes > 0 { Text(UnitConverter.formatDuration(minutes: workout.durationMinutes)).font(.caption).foregroundStyle(.secondary) }
                    } else {
                        if workout.distanceKm > 0 { Text(UnitConverter.formatDistance(workout.distanceKm, unit: unitPref)).font(.caption).foregroundStyle(.secondary) }
                    }
                    switch workout.completionStatus {
                    case .completed: Image(systemName: "checkmark.circle.fill").foregroundStyle(.green).accessibilityLabel("Completed")
                    case .scheduled: Image(systemName: "applewatch").foregroundStyle(.blue).accessibilityLabel("Scheduled on Watch")
                    case .skipped: Image(systemName: "xmark.circle.fill").foregroundStyle(.orange).accessibilityLabel("Skipped")
                    case .planned: Image(systemName: "circle").foregroundStyle(.secondary).accessibilityLabel("Planned")
                    }
                }
            }
        }
        .padding()
        .background(.fill.quaternary, in: RoundedRectangle(cornerRadius: 16))
    }
}

private struct EmptyDashboardView: View {
    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            Image(systemName: "figure.run.circle").font(.system(size: 60)).foregroundStyle(.secondary)
            Text("No Active Plan").font(.title3.bold())
            Text("Create a training plan to get started.").font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
            NavigationLink("Create Plan") { GeneratePlanView() }.buttonStyle(.borderedProminent)
            Spacer()
        }
        .padding()
    }
}
