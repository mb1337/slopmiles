import SwiftUI
import SwiftData

@main
struct SlopMilesApp: App {
    @State private var appState = AppState()

    var sharedModelContainer: ModelContainer = {
        let schema = Schema([
            TrainingPlan.self,
            TrainingWeek.self,
            PlannedWorkout.self,
            PlannedWorkoutStep.self,
            UserProfile.self,
            WeeklySchedule.self,
            RunnerEquipment.self,
            AISettings.self,
        ])
        let modelConfiguration = ModelConfiguration(
            schema: schema,
            isStoredInMemoryOnly: false,
            cloudKitDatabase: .automatic
        )
        do {
            return try ModelContainer(for: schema, configurations: [modelConfiguration])
        } catch {
            fatalError("Could not create ModelContainer: \(error)")
        }
    }()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(appState)
                .modelContainer(sharedModelContainer)
                .task {
                    ensureSingletonModelsExist()
                }
        }
    }

    /// Seed singleton SwiftData models once at app launch so views never
    /// need to create them during body evaluation.
    private func ensureSingletonModelsExist() {
        let context = sharedModelContainer.mainContext
        func ensureExists<T: PersistentModel>(_ type: T.Type, create: () -> T) {
            let descriptor = FetchDescriptor<T>()
            let count = (try? context.fetchCount(descriptor)) ?? 0
            if count == 0 {
                context.insert(create())
            }
        }
        ensureExists(AISettings.self) { AISettings() }
        ensureExists(UserProfile.self) { UserProfile() }
        ensureExists(WeeklySchedule.self) { WeeklySchedule() }
        ensureExists(RunnerEquipment.self) { RunnerEquipment() }
    }
}
