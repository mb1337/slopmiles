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
    @Query(sort: \TrainingPlan.createdAt, order: .reverse) private var allPlans: [TrainingPlan]
    @Query(sort: \CoachingConversation.updatedAt, order: .reverse)
    private var conversations: [CoachingConversation]
    @State private var selectedWorkout: PlannedWorkout?
    @State private var errorMessage: String?
    @State private var showError = false
    @State private var showStartDateSheet = false
    @State private var newStartDate = Date()
    @State private var showDeleteConfirm = false
    @State private var weekToRegenerate: TrainingWeek?
    @State private var scheduleSuccessCount = 0

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
                            Button { selectedWorkout = workout } label: {
                                WorkoutRowView(workout: workout, unitPref: unitPref)
                            }
                        }
                        .onMove { source, destination in
                            moveWorkouts(in: week, from: source, to: destination)
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
                        if week.weeklyVolumePercent > 0 {
                            Text("\(Int(week.weeklyVolumePercent))% of peak").foregroundStyle(.secondary)
                            Text("·").foregroundStyle(.quaternary)
                        }
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
                            weekToRegenerate = week
                        }
                        .tint(.orange)
                    }
                }
            }
        }
        .navigationTitle(plan.name)
        .navigationDestination(item: $selectedWorkout) { WorkoutDetailView(workout: $0) }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    EditButton()
                    Button("Schedule Next Week to Watch") {
                        if let week = plan.sortedWeeks.first(where: { $0.workoutsGenerated && $0.sortedWorkouts.contains { $0.completionStatus == .planned } }) {
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
                    }
                    if !plan.isActive {
                        Button("Set as Active Plan", systemImage: "checkmark.circle") {
                            Task { await switchActivePlan(to: plan) }
                        }
                    }
                    Button("Change Start Date", systemImage: "calendar") {
                        newStartDate = plan.startDate
                        showStartDateSheet = true
                    }
                    Divider()
                    Button("Delete Plan", systemImage: "trash", role: .destructive) {
                        showDeleteConfirm = true
                    }
                } label: { Image(systemName: "ellipsis") }
            }
        }
        .alert("Scheduling Error", isPresented: $showError) {
            Button("OK") {}
        } message: {
            Text(errorMessage ?? "")
        }
        .confirmationDialog("Delete Plan", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                modelContext.delete(plan)
                try? modelContext.save()
                let remaining = allPlans.filter { $0.id != plan.id }
                if !remaining.contains(where: { $0.isActive }) {
                    NotificationService.cancelWeeklyReminder()
                }
                dismiss()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Delete \u{201C}\(plan.name)\u{201D}? This cannot be undone.")
        }
        .confirmationDialog("Regenerate Week", isPresented: Binding(
            get: { weekToRegenerate != nil },
            set: { if !$0 { weekToRegenerate = nil } }
        ), titleVisibility: .visible) {
            Button("Regenerate") {
                if let week = weekToRegenerate {
                    regenerateWeek(week)
                }
                weekToRegenerate = nil
            }
            Button("Cancel", role: .cancel) { weekToRegenerate = nil }
        } message: {
            Text("Regenerate this week\u{2019}s workouts? All current workouts will be replaced. This uses an API call.")
        }
        .sensoryFeedback(.success, trigger: scheduleSuccessCount)
        .sensoryFeedback(.error, trigger: showError) { _, new in new }
        .sheet(isPresented: $showStartDateSheet) {
            ChangeStartDateSheet(plan: plan, newStartDate: $newStartDate)
        }
    }

    private func switchActivePlan(to newPlan: TrainingPlan) async {
        let profile = profiles.first
        let firstDayOfWeek = profile?.firstDayOfWeek ?? 1

        // Unschedule old plan's current week
        if let oldPlan = allPlans.first(where: { $0.isActive }),
           let oldWeek = appState.weekGenerationManager.findCurrentWeek(in: oldPlan, now: Date(), firstDayOfWeek: firstDayOfWeek) {
            try? await appState.workoutKitService.unscheduleWeek(oldWeek)
            appState.calendarService.removeWeekEvents(oldWeek)
        }

        TrainingPlan.setActivePlan(newPlan, in: modelContext)
        try? modelContext.save()

        // Schedule new plan's current week
        if let newWeek = appState.weekGenerationManager.findCurrentWeek(in: newPlan, now: Date(), firstDayOfWeek: firstDayOfWeek),
           newWeek.workoutsGenerated {
            try? await appState.workoutKitService.scheduleWeek(newWeek)
            appState.calendarService.syncWeek(newWeek, schedule: schedules.first)
        }
    }

    private func moveWorkouts(in week: TrainingWeek, from source: IndexSet, to destination: Int) {
        var workouts = week.sortedWorkouts
        let originalDates = workouts.map(\.scheduledDate)
        workouts.move(fromOffsets: source, toOffset: destination)

        var reschedulePairs: [(PlannedWorkout, Date)] = []
        for (index, workout) in workouts.enumerated() {
            let newDate = originalDates[index]
            if workout.scheduledDate != newDate {
                let oldDate = workout.scheduledDate
                workout.scheduledDate = newDate
                if workout.completionStatus == .scheduled {
                    reschedulePairs.append((workout, oldDate))
                }
            }
        }
        try? modelContext.save()

        if !reschedulePairs.isEmpty {
            Task {
                for (workout, oldDate) in reschedulePairs {
                    try? await appState.workoutKitService.rescheduleWorkout(workout, from: oldDate)
                    appState.calendarService.syncWorkout(workout)
                }
            }
        }
    }

    private func regenerateWeek(_ week: TrainingWeek) {
        guard let profile = profiles.first,
              let schedule = schedules.first,
              let equipment = equipmentList.first,
              let settings = aiSettings.first else { return }

        let conversation: CoachingConversation
        if let existing = conversations.first {
            conversation = existing
        } else {
            let new = CoachingConversation()
            modelContext.insert(new)
            try? modelContext.save()
            conversation = new
        }

        appState.weekGenerationManager.regenerateWeek(
            week: week, plan: plan,
            profile: profile, schedule: schedule, equipment: equipment,
            settings: settings, coachingService: appState.coachingService,
            context: modelContext,
            healthKitService: appState.healthKitService,
            workoutKitService: appState.workoutKitService,
            calendarService: appState.calendarService,
            conversation: conversation
        )
    }
}

private struct ChangeStartDateSheet: View {
    let plan: TrainingPlan
    @Binding var newStartDate: Date
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    private var dayDelta: Int {
        Calendar.current.dateComponents([.day], from: Calendar.current.startOfDay(for: plan.startDate), to: Calendar.current.startOfDay(for: newStartDate)).day ?? 0
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    DatePicker("New Start Date", selection: $newStartDate, displayedComponents: .date)
                }
                Section {
                    if dayDelta != 0 {
                        let direction = dayDelta > 0 ? "later" : "earlier"
                        Text("All workouts will shift \(abs(dayDelta)) day\(abs(dayDelta) == 1 ? "" : "s") \(direction).")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    } else {
                        Text("No change from current start date.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    if let raceDate = plan.raceDate {
                        let newEnd = Calendar.current.date(byAdding: .day, value: dayDelta, to: plan.endDate)!
                        let weeksToRace = Calendar.current.dateComponents([.weekOfYear], from: newEnd, to: raceDate).weekOfYear ?? 0
                        Text("Race date: \(DateFormatters.shortDate(from: raceDate)) (\(weeksToRace) weeks after plan ends)")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("Change Start Date")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Apply") {
                        plan.shiftStartDate(to: newStartDate)
                        try? modelContext.save()
                        dismiss()
                    }
                    .disabled(dayDelta == 0)
                }
            }
        }
        .presentationDetents([.medium])
    }
}

#Preview {
    NavigationStack {
        PlanDetailView(plan: PreviewData.samplePlan)
    }
    .environment(PreviewData.appState)
    .modelContainer(PreviewData.container)
}
