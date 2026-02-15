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
    var volumeTypeRaw: String = VolumeType.distance.rawValue
    var rawAIResponse: String = ""
    var outlineRawAIResponse: String = ""
    var isActive: Bool = false
    var cachedVDOT: Double?
    var createdAt: Date = Date()

    var difficulty: DifficultyLevel {
        get { DifficultyLevel(rawValue: difficultyRaw) ?? .intermediate }
        set { difficultyRaw = newValue.rawValue }
    }

    var volumeType: VolumeType {
        get { VolumeType(rawValue: volumeTypeRaw) ?? .distance }
        set { volumeTypeRaw = newValue.rawValue }
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

    init(name: String, goalDescription: String, raceDistance: Double? = nil, raceDate: Date? = nil, difficulty: DifficultyLevel = .intermediate, startDate: Date, endDate: Date, weeklyMileageTargetKm: Double = 0, isActive: Bool = false) {
        self.name = name
        self.goalDescription = goalDescription
        self.raceDistance = raceDistance
        self.raceDate = raceDate
        self.difficulty = difficulty
        self.startDate = startDate
        self.endDate = endDate
        self.weeklyMileageTargetKm = weeklyMileageTargetKm
        self.isActive = isActive
    }

    static func setActivePlan(_ plan: TrainingPlan, in context: ModelContext) {
        let descriptor = FetchDescriptor<TrainingPlan>()
        let allPlans = (try? context.fetch(descriptor)) ?? []
        for p in allPlans {
            p.isActive = false
        }
        plan.isActive = true
    }

    func shiftStartDate(to newStart: Date) {
        let calendar = Calendar.current
        let dayDelta = calendar.dateComponents([.day], from: calendar.startOfDay(for: startDate), to: calendar.startOfDay(for: newStart)).day ?? 0
        guard dayDelta != 0 else { return }

        startDate = calendar.date(byAdding: .day, value: dayDelta, to: startDate)!
        endDate = calendar.date(byAdding: .day, value: dayDelta, to: endDate)!

        for week in (weeks ?? []) {
            for workout in (week.workouts ?? []) {
                workout.scheduledDate = calendar.date(byAdding: .day, value: dayDelta, to: workout.scheduledDate)!
            }
        }
        // raceDate is intentionally left unchanged — it's a real-world constraint
    }
}
