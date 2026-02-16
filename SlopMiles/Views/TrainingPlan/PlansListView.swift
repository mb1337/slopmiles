import SwiftUI
import SwiftData

struct PlansListView: View {
    @Query(sort: \TrainingPlan.createdAt, order: .reverse) private var plans: [TrainingPlan]
    @Environment(AppState.self) private var appState
    @Environment(\.modelContext) private var modelContext

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
                                        TrainingPlan.setActivePlan(plan, in: modelContext)
                                        try? modelContext.save()
                                    } label: { Label("Set Active", systemImage: "checkmark.circle") }
                                        .tint(.blue)
                                }
                            }
                            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                Button(role: .destructive) {
                                    modelContext.delete(plan)
                                    try? modelContext.save()
                                } label: { Label("Delete", systemImage: "trash") }
                            }
                        }
                    }
                }
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
}
