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

    /// Ensure exactly one instance of each singleton SwiftData model exists.
    ///
    /// On first launch this seeds the default instance. On subsequent launches
    /// it deduplicates — CloudKit sync can create duplicates across devices
    /// because `@Attribute(.unique)` is not compatible with CloudKit.
    /// We keep the first fetched instance and delete any extras.
    private func ensureSingletonModelsExist() {
        let context = sharedModelContainer.mainContext

        func deduplicateAndEnsure<T: PersistentModel>(_ type: T.Type, create: () -> T) {
            let descriptor = FetchDescriptor<T>()
            let all = (try? context.fetch(descriptor)) ?? []
            if all.isEmpty {
                context.insert(create())
            } else if all.count > 1 {
                // Keep the first instance, delete the rest
                for duplicate in all.dropFirst() {
                    context.delete(duplicate)
                }
            }
        }

        deduplicateAndEnsure(AISettings.self) { AISettings() }
        deduplicateAndEnsure(UserProfile.self) { UserProfile() }
        deduplicateAndEnsure(WeeklySchedule.self) { WeeklySchedule() }
        deduplicateAndEnsure(RunnerEquipment.self) { RunnerEquipment() }
    }
}
