import Foundation
import SwiftData

@Model
final class TrainingWeek {
    var id: UUID = UUID()
    var weekNumber: Int = 1
    var theme: String = ""
    var weeklyVolumePercent: Double = 0
    var totalDistanceKm: Double = 0
    var totalDurationMinutes: Double = 0
    var notes: String = ""
    var workoutsGenerated: Bool = false

    var plan: TrainingPlan?

    @Relationship(deleteRule: .cascade, inverse: \PlannedWorkout.week)
    var workouts: [PlannedWorkout]? = []

    var sortedWorkouts: [PlannedWorkout] {
        (workouts ?? []).sorted { $0.scheduledDate < $1.scheduledDate }
    }

    init() {}

    init(weekNumber: Int, theme: String = "", totalDistanceKm: Double = 0, totalDurationMinutes: Double = 0, notes: String = "", workoutsGenerated: Bool = false) {
        self.weekNumber = weekNumber
        self.theme = theme
        self.totalDistanceKm = totalDistanceKm
        self.totalDurationMinutes = totalDurationMinutes
        self.notes = notes
        self.workoutsGenerated = workoutsGenerated
    }
}
