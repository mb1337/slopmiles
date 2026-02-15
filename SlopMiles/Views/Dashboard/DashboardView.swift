import SwiftUI
import SwiftData

struct DashboardView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \TrainingPlan.createdAt, order: .reverse) private var plans: [TrainingPlan]
    @Query private var profiles: [UserProfile]
    @Query private var schedules: [WeeklySchedule]
    @Query private var equipmentList: [RunnerEquipment]
    @Query private var aiSettings: [AISettings]

    private var activePlan: TrainingPlan? {
        plans.first { $0.endDate >= Date() }
    }

    private var currentWeek: TrainingWeek? {
        guard let plan = activePlan, let profile = profiles.first else { return nil }
        return appState.weekGenerationManager.findCurrentWeek(
            in: plan, now: Date(), firstDayOfWeek: profile.firstDayOfWeek
        )
    }

    private var nextWorkout: PlannedWorkout? {
        guard let week = currentWeek, week.workoutsGenerated else { return nil }
        return week.sortedWorkouts.first { $0.completionStatus == .planned || $0.completionStatus == .scheduled }
    }

    private var unitPref: UnitPreference { profiles.first?.unitPreference ?? .metric }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    if let plan = activePlan, let week = currentWeek {
                        CurrentPlanCard(plan: plan, week: week, unitPref: unitPref)

                        if !week.workoutsGenerated {
                            WeekGeneratingCard(
                                status: appState.weekGenerationManager.status,
                                weekNumber: week.weekNumber,
                                onRetry: { triggerAutoGeneration() }
                            )
                        } else {
                            if let workout = nextWorkout {
                                NextWorkoutCard(workout: workout, unitPref: unitPref)
                            }
                            WeekOverviewCard(week: week, unitPref: unitPref)
                        }
                    } else {
                        EmptyDashboardView()
                    }
                }
                .padding()
            }
            .navigationTitle("Dashboard")
            .task {
                if appState.locationService.isAuthorized, let profile = profiles.first {
                    await appState.locationService.updateProfileLocation(profile)
                }
                triggerAutoGeneration()
            }
        }
    }

    private func triggerAutoGeneration() {
        guard let profile = profiles.first,
              let schedule = schedules.first,
              let equipment = equipmentList.first,
              let settings = aiSettings.first else { return }

        appState.weekGenerationManager.checkAndGenerateIfNeeded(
            plans: plans,
            profile: profile,
            schedule: schedule,
            equipment: equipment,
            settings: settings,
            aiService: appState.aiService,
            context: modelContext
        )
    }
}

private struct WeekGeneratingCard: View {
    let status: WeekGenerationManager.Status
    let weekNumber: Int
    let onRetry: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            switch status {
            case .generating(let n):
                HStack(spacing: 12) {
                    ProgressView()
                    Text("Generating week \(n) workouts...")
                        .font(.subheadline)
                }
            case .failed(let message):
                VStack(spacing: 8) {
                    Label("Generation failed", systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.orange)
                        .font(.subheadline.bold())
                    Text(message)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                    Button("Retry") { onRetry() }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.small)
                }
            case .idle:
                VStack(spacing: 8) {
                    Label("Week \(weekNumber) workouts not yet generated", systemImage: "sparkles")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Button("Generate Now") { onRetry() }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.small)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(.fill.quaternary, in: RoundedRectangle(cornerRadius: 16))
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
                    VStack(spacing: 4) { Text(UnitConverter.formatDuration(minutes: week.totalDurationMinutes)).font(.headline); Text(week.workoutsGenerated ? "Duration" : "Target").font(.caption2).foregroundStyle(.secondary) }
                } else {
                    VStack(spacing: 4) { Text(UnitConverter.formatDistance(week.totalDistanceKm, unit: unitPref)).font(.headline); Text(week.workoutsGenerated ? "Distance" : "Target").font(.caption2).foregroundStyle(.secondary) }
                }
                if week.workoutsGenerated {
                    VStack(spacing: 4) { Text("\(week.sortedWorkouts.filter { $0.workoutType != .rest }.count)").font(.headline); Text("Workouts").font(.caption2).foregroundStyle(.secondary) }
                    let completed = week.sortedWorkouts.filter { $0.completionStatus == .completed }.count
                    let total = week.sortedWorkouts.filter { $0.workoutType != .rest }.count
                    VStack(spacing: 4) { Text("\(completed)/\(total)").font(.headline); Text("Done").font(.caption2).foregroundStyle(.secondary) }
                }
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
