import SwiftUI
import SwiftData

// MARK: - App

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
                    await appState.healthKitService.restoreAuthorizationStatus()
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

        // Backfill: mark existing weeks that already have workouts as generated
        let weekDescriptor = FetchDescriptor<TrainingWeek>()
        if let allWeeks = try? context.fetch(weekDescriptor) {
            for week in allWeeks {
                if !week.workoutsGenerated && !(week.workouts ?? []).isEmpty {
                    week.workoutsGenerated = true
                }
            }
        }

        // Backfill: ensure exactly one plan is active
        let planDescriptor = FetchDescriptor<TrainingPlan>()
        if let allPlans = try? context.fetch(planDescriptor) {
            let activePlans = allPlans.filter { $0.isActive }
            if activePlans.isEmpty {
                // Activate the first non-expired plan (matches old heuristic)
                let now = Date()
                if let firstActive = allPlans.first(where: { $0.endDate >= now }) {
                    firstActive.isActive = true
                }
            } else if activePlans.count > 1 {
                // CloudKit sync may create duplicates — keep only the first
                for plan in activePlans.dropFirst() {
                    plan.isActive = false
                }
            }
        }

        try? context.save()
    }
}
