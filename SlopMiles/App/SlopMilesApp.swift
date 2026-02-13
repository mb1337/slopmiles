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
        }
    }
}
