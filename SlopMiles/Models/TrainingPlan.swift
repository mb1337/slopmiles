import Foundation
import SwiftData

enum DifficultyLevel: String, Codable, CaseIterable {
    case beginner
    case intermediate
    case advanced

    var displayName: String {
        rawValue.capitalized
    }
}

@Model
final class TrainingPlan {
    var id: UUID = UUID()
    var name: String = ""
    var goalDescription: String = ""
    var raceDistance: Double?
    var raceDate: Date?
    var difficultyRaw: String = DifficultyLevel.intermediate.rawValue
    var startDate: Date = Date()
    var endDate: Date = Date()
    var weeklyMileageTargetKm: Double = 0
    var rawAIResponse: String = ""
    var createdAt: Date = Date()

    var difficulty: DifficultyLevel {
        get { DifficultyLevel(rawValue: difficultyRaw) ?? .intermediate }
        set { difficultyRaw = newValue.rawValue }
    }

    @Relationship(deleteRule: .cascade, inverse: \TrainingWeek.plan)
    var weeks: [TrainingWeek]? = []

    var sortedWeeks: [TrainingWeek] {
        (weeks ?? []).sorted { $0.weekNumber < $1.weekNumber }
    }

    var totalWeeks: Int {
        weeks?.count ?? 0
    }

    init() {}

    init(name: String, goalDescription: String, raceDistance: Double? = nil, raceDate: Date? = nil, difficulty: DifficultyLevel = .intermediate, startDate: Date, endDate: Date, weeklyMileageTargetKm: Double = 0) {
        self.name = name
        self.goalDescription = goalDescription
        self.raceDistance = raceDistance
        self.raceDate = raceDate
        self.difficulty = difficulty
        self.startDate = startDate
        self.endDate = endDate
        self.weeklyMileageTargetKm = weeklyMileageTargetKm
    }
}
