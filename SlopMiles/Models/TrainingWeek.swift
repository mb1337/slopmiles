import Foundation
import SwiftData

@Model
final class TrainingWeek {
    var id: UUID = UUID()
    var weekNumber: Int = 1
    var theme: String = ""
    var totalDistanceKm: Double = 0
    var notes: String = ""

    var plan: TrainingPlan?

    @Relationship(deleteRule: .cascade, inverse: \PlannedWorkout.week)
    var workouts: [PlannedWorkout]? = []

    var sortedWorkouts: [PlannedWorkout] {
        (workouts ?? []).sorted { $0.scheduledDate < $1.scheduledDate }
    }

    init() {}

    init(weekNumber: Int, theme: String = "", totalDistanceKm: Double = 0, notes: String = "") {
        self.weekNumber = weekNumber
        self.theme = theme
        self.totalDistanceKm = totalDistanceKm
        self.notes = notes
    }
}
