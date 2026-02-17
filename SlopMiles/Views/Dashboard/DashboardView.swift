import SwiftUI
import SwiftData

struct DashboardView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.modelContext) private var modelContext
    @Environment(\.scenePhase) private var scenePhase
    @Query(sort: \TrainingPlan.createdAt, order: .reverse) private var plans: [TrainingPlan]
    @Query private var profiles: [UserProfile]
    @Query private var schedules: [WeeklySchedule]
    @Query private var equipmentList: [RunnerEquipment]
    @Query private var aiSettings: [AISettings]

    private var activePlan: TrainingPlan? {
        plans.first { $0.isActive }
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
                    if let plan = activePlan {
                        if let week = currentWeek {
                            CurrentPlanCard(plan: plan, week: week, unitPref: unitPref)

                            if !week.workoutsGenerated {
                                WeekGeneratingCard(
                                    status: appState.weekGenerationManager.status,
                                    weekNumber: week.weekNumber,
                                    onRetry: { triggerAutoGeneration() }
                                )
                            } else {
                                if let workout = nextWorkout {
                                    NavigationLink(value: workout) {
                                        NextWorkoutCard(workout: workout, unitPref: unitPref)
                                    }
                                    .buttonStyle(.plain)
                                }
                                WeekOverviewCard(week: week, unitPref: unitPref)
                            }
                        } else {
                            ActivePlanNoWeekCard(plan: plan)
                        }
                    } else {
                        EmptyDashboardView()
                    }
                }
                .padding()
            }
            .navigationDestination(for: PlannedWorkout.self) { WorkoutDetailView(workout: $0) }
            .navigationTitle("Dashboard")
            .task {
                if appState.locationService.isAuthorized, let profile = profiles.first {
                    await appState.locationService.updateProfileLocation(profile)
                }
                triggerAutoGeneration()
                await autoLinkHealthKitWorkouts()
            }
            .onChange(of: scenePhase) { _, newPhase in
                if newPhase == .active {
                    triggerAutoGeneration()
                    Task { await autoLinkHealthKitWorkouts() }
                }
            }
        }
    }

    private func autoLinkHealthKitWorkouts() async {
        guard appState.healthKitService.isAuthorized,
              let week = currentWeek,
              week.workoutsGenerated else { return }

        let workouts = week.sortedWorkouts
        guard !workouts.isEmpty else { return }

        // Determine date range for the week's workouts
        let dates = workouts.map(\.scheduledDate)
        guard let earliest = dates.min(), let latest = dates.max() else { return }

        let calendar = Calendar.current
        let startOfEarliest = calendar.startOfDay(for: earliest)
        let endOfLatest = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: latest))!

        let hkWorkouts = await appState.healthKitService.fetchRunningWorkouts(
            from: startOfEarliest, to: endOfLatest
        )

        WorkoutMatcher.removeStaleLinks(plannedWorkouts: workouts, hkWorkouts: hkWorkouts)

        let matches = WorkoutMatcher.findMatches(
            plannedWorkouts: workouts, hkWorkouts: hkWorkouts
        )
        WorkoutMatcher.applyMatches(matches)
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
            context: modelContext,
            workoutKitService: appState.workoutKitService
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
        .accessibilityElement(children: .combine)
        .padding()
        .background(.fill.quaternary, in: RoundedRectangle(cornerRadius: 16))
    }
}

private struct NextWorkoutCard: View {
    let workout: PlannedWorkout
    let unitPref: UnitPreference

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
        }
        .accessibilityElement(children: .combine)
        .padding()
        .background(.fill.quaternary, in: RoundedRectangle(cornerRadius: 16))
    }
}

private struct WeekOverviewCard: View {
    let week: TrainingWeek
    let unitPref: UnitPreference
    @Environment(AppState.self) private var appState
    @State private var errorMessage: String?
    @State private var showError = false
    @State private var scheduleSuccessCount = 0

    private func dayLabel(for workout: PlannedWorkout) -> String {
        let day = DateFormatters.shortDayOfWeek(from: workout.scheduledDate)
        let calendar = Calendar.current
        let hasDouble = week.sortedWorkouts.contains { other in
            other.id != workout.id && calendar.isDate(other.scheduledDate, inSameDayAs: workout.scheduledDate)
        }
        if hasDouble {
            return "\(day) \(DateFormatters.timeOnly(from: workout.scheduledDate))"
        }
        return day
    }

    private var hasPlannedWorkouts: Bool {
        week.sortedWorkouts.contains { $0.workoutType != .rest && $0.completionStatus == .planned }
    }

    private var allNonRestScheduled: Bool {
        let nonRest = week.sortedWorkouts.filter { $0.workoutType != .rest }
        return !nonRest.isEmpty && nonRest.allSatisfy { $0.completionStatus == .scheduled || $0.completionStatus == .completed }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("This Week").font(.headline)
            ForEach(week.sortedWorkouts) { workout in
                NavigationLink(value: workout) {
                    HStack {
                        Image(systemName: workout.workoutType.iconName).foregroundStyle(.blue).frame(width: 24)
                        VStack(alignment: .leading) {
                            Text(workout.name).font(.subheadline)
                            Text(dayLabel(for: workout)).font(.caption).foregroundStyle(.secondary)
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
                .buttonStyle(.plain)
            }
            if hasPlannedWorkouts {
                Button("Schedule Week to Watch") {
                    Task {
                        do {
                            try await appState.workoutKitService.scheduleWeek(week)
                            scheduleSuccessCount += 1
                        } catch {
                            errorMessage = error.localizedDescription
                            showError = true
                        }
                    }
                }
                .buttonStyle(.borderedProminent).controlSize(.small)
            } else if allNonRestScheduled {
                Label("Week scheduled on Watch", systemImage: "applewatch")
                    .font(.caption).foregroundStyle(.green)
            }
        }
        .padding()
        .background(.fill.quaternary, in: RoundedRectangle(cornerRadius: 16))
        .alert("Scheduling Error", isPresented: $showError) {
            Button("OK") {}
        } message: {
            Text(errorMessage ?? "")
        }
        .sensoryFeedback(.success, trigger: scheduleSuccessCount)
        .sensoryFeedback(.error, trigger: showError) { _, new in new }
    }
}

private struct ActivePlanNoWeekCard: View {
    let plan: TrainingPlan

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(plan.name).font(.headline)
            let now = Date()
            if now < plan.startDate {
                Text("Plan starts \(DateFormatters.shortDate(from: plan.startDate))")
                    .font(.subheadline).foregroundStyle(.secondary)
            } else if now > plan.endDate {
                Text("Plan ended \(DateFormatters.shortDate(from: plan.endDate))")
                    .font(.subheadline).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(.fill.quaternary, in: RoundedRectangle(cornerRadius: 16))
    }
}

private struct EmptyDashboardView: View {
    @ScaledMetric(relativeTo: .largeTitle) private var iconSize: CGFloat = 60

    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            Image(systemName: "figure.run.circle").font(.system(size: iconSize)).foregroundStyle(.secondary)
            Text("No Active Plan").font(.title3.bold())
            Text("Create a training plan to get started.").font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
            NavigationLink("Create Plan") { GeneratePlanView() }.buttonStyle(.borderedProminent)
            Spacer()
        }
        .padding()
    }
}
