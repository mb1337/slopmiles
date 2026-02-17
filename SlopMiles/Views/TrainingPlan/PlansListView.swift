import SwiftUI
import SwiftData

struct PlansListView: View {
    @Query(sort: \TrainingPlan.createdAt, order: .reverse) private var plans: [TrainingPlan]
    @Query private var profiles: [UserProfile]
    @Environment(AppState.self) private var appState
    @Environment(\.modelContext) private var modelContext
    @State private var planToDelete: TrainingPlan?

    var body: some View {
        @Bindable var state = appState
        NavigationStack(path: $state.plansNavigationPath) {
            Group {
                if plans.isEmpty {
                    ContentUnavailableView { Label("No Plans", systemImage: "calendar.badge.plus") }
                        description: { Text("Generate your first training plan with your AI coach.") }
                        actions: { NavigationLink("Generate Plan") { GeneratePlanView() }.buttonStyle(.borderedProminent) }
                } else {
                    List {
                        ForEach(plans) { plan in
                            NavigationLink(value: plan) {
                                VStack(alignment: .leading, spacing: 4) {
                                    HStack {
                                        Text(plan.name).font(.headline)
                                        if plan.isActive {
                                            Text("Active")
                                                .font(.caption2.bold())
                                                .padding(.horizontal, 8)
                                                .padding(.vertical, 2)
                                                .background(.blue, in: Capsule())
                                                .foregroundStyle(.white)
                                        }
                                    }
                                    Text(plan.goalDescription).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                                    HStack {
                                        Text("\(plan.totalWeeks) weeks")
                                        Text("\u{00B7}")
                                        Text("\(DateFormatters.shortDate(from: plan.startDate)) \u{2013} \(DateFormatters.shortDate(from: plan.endDate))")
                                    }
                                    .font(.caption).foregroundStyle(.secondary)
                                }
                                .padding(.vertical, 4)
                            }
                            .swipeActions(edge: .leading) {
                                if !plan.isActive {
                                    Button {
                                        Task { await switchActivePlan(to: plan) }
                                    } label: { Label("Set Active", systemImage: "checkmark.circle") }
                                        .tint(.blue)
                                }
                            }
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                Button(role: .destructive) {
                                    planToDelete = plan
                                } label: { Label("Delete", systemImage: "trash") }
                            }
                        }
                    }
                }
            }
            .confirmationDialog("Delete Plan", isPresented: Binding(
                get: { planToDelete != nil },
                set: { if !$0 { planToDelete = nil } }
            ), titleVisibility: .visible) {
                Button("Delete", role: .destructive) {
                    if let plan = planToDelete {
                        modelContext.delete(plan)
                        try? modelContext.save()
                    }
                    planToDelete = nil
                }
                Button("Cancel", role: .cancel) { planToDelete = nil }
            } message: {
                Text("Delete \u{201C}\(planToDelete?.name ?? "")\u{201D}? This cannot be undone.")
            }
            .navigationTitle("Plans")
            .toolbar { ToolbarItem(placement: .primaryAction) { NavigationLink { GeneratePlanView() } label: { Image(systemName: "plus") } } }
            .navigationDestination(for: TrainingPlan.self) { PlanDetailView(plan: $0) }
            .onChange(of: appState.planGenerationManager.completedPlan) { _, plan in
                if let plan {
                    appState.planGenerationManager.completedPlan = nil
                    var path = NavigationPath()
                    path.append(plan)
                    appState.plansNavigationPath = path
                    appState.selectedTab = .plans
                }
            }
        }
    }

    private func switchActivePlan(to newPlan: TrainingPlan) async {
        let firstDayOfWeek = profiles.first?.firstDayOfWeek ?? 1

        // Unschedule old plan's current week
        if let oldPlan = plans.first(where: { $0.isActive }),
           let oldWeek = appState.weekGenerationManager.findCurrentWeek(in: oldPlan, now: Date(), firstDayOfWeek: firstDayOfWeek) {
            try? await appState.workoutKitService.unscheduleWeek(oldWeek)
        }

        TrainingPlan.setActivePlan(newPlan, in: modelContext)
        try? modelContext.save()

        // Schedule new plan's current week
        if let newWeek = appState.weekGenerationManager.findCurrentWeek(in: newPlan, now: Date(), firstDayOfWeek: firstDayOfWeek),
           newWeek.workoutsGenerated {
            try? await appState.workoutKitService.scheduleWeek(newWeek)
        }
    }
}
