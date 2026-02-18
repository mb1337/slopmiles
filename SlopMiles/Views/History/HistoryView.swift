import SwiftUI
import SwiftData
import HealthKit

struct HistoryView: View {
    @Environment(AppState.self) private var appState
    @Query private var profiles: [UserProfile]
    @State private var workouts: [HKWorkout] = []
    @State private var isLoading = false

    private var unitPreference: UnitPreference {
        profiles.first?.unitPreference ?? .metric
    }

    var body: some View {
        NavigationStack {
            Group {
                if !appState.healthKitService.isAuthorized {
                    ContentUnavailableView { Label("No Health Access", systemImage: "heart.slash") }
                        description: { Text("Enable HealthKit access in Settings to see your run history.") }
                        actions: { Button("Request Access") { Task { await appState.healthKitService.requestAuthorization() } }.buttonStyle(.borderedProminent) }
                } else if isLoading {
                    ProgressView("Loading runs...")
                } else if workouts.isEmpty {
                    ContentUnavailableView("No Runs Found", systemImage: "figure.run", description: Text("Your recent running workouts will appear here."))
                } else {
                    List(workouts, id: \.uuid) { workout in
                        HStack {
                            Image(systemName: "figure.run").foregroundStyle(Theme.accent)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(DateFormatters.shortDate(from: workout.startDate)).font(.subheadline)
                                HStack(spacing: 8) {
                                    if let d = workout.totalDistance {
                                        let km = d.doubleValue(for: .meterUnit(with: .kilo))
                                        Text(UnitConverter.formatDistance(km, unit: unitPreference))
                                    }
                                    Text(String(format: "%.0f min", workout.duration / 60))
                                    if let d = workout.totalDistance {
                                        let km = d.doubleValue(for: .meterUnit(with: .kilo))
                                        if km > 0 { Text(UnitConverter.formatPace((workout.duration / 60) / km, unit: unitPreference)) }
                                    }
                                }
                                .font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                        }
                        .accessibilityElement(children: .combine)
                    }
                    .refreshable { await loadWorkouts() }
                }
            }
            .navigationTitle("History")
            .task { await loadWorkouts() }
        }
    }

    private func loadWorkouts() async {
        guard appState.healthKitService.isAuthorized else { return }
        isLoading = true
        let ninetyDaysAgo = Calendar.current.date(byAdding: .day, value: -90, to: Date())!
        workouts = await appState.healthKitService.fetchRunningWorkouts(from: ninetyDaysAgo, to: Date())
        isLoading = false
    }
}

#Preview {
    HistoryView()
        .environment(PreviewData.appState)
        .modelContainer(PreviewData.container)
}
