import SwiftUI
import SwiftData

struct PlansListView: View {
    @Query(sort: \TrainingPlan.createdAt, order: .reverse) private var plans: [TrainingPlan]

    var body: some View {
        NavigationStack {
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
                                    Text(plan.name).font(.headline)
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
                        }
                    }
                }
            }
            .navigationTitle("Plans")
            .toolbar { ToolbarItem(placement: .primaryAction) { NavigationLink { GeneratePlanView() } label: { Image(systemName: "plus") } } }
            .navigationDestination(for: TrainingPlan.self) { PlanDetailView(plan: $0) }
        }
    }
}
