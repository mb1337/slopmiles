import Foundation
import SwiftData

enum StepType: String, Codable {
    case warmup
    case work
    case recovery
    case cooldown
}

enum StepGoalType: String, Codable {
    case distance
    case time
    case open
}

@Model
final class PlannedWorkoutStep {
    var id: UUID = UUID()
    var order: Int = 0
    var stepTypeRaw: String = StepType.work.rawValue
    var name: String = ""
    var goalTypeRaw: String = StepGoalType.open.rawValue
    /// Goal value in WorkoutKit native units: distance in meters, time in seconds.
    var goalValue: Double?
    var targetPaceMinPerKm: Double?
    var hrZone: Int?
    var repeatCount: Int = 1
    /// Steps sharing the same non-zero groupId form an interval repeat group.
    /// The repeatCount on the first step in the group sets the iteration count.
    /// A groupId of 0 means the step is ungrouped (legacy behavior).
    var groupId: Int = 0

    var workout: PlannedWorkout?

    var stepType: StepType {
        get { StepType(rawValue: stepTypeRaw) ?? .work }
        set { stepTypeRaw = newValue.rawValue }
    }

    var goalType: StepGoalType {
        get { StepGoalType(rawValue: goalTypeRaw) ?? .open }
        set { goalTypeRaw = newValue.rawValue }
    }

    init() {}

    init(order: Int, stepType: StepType, name: String = "", goalType: StepGoalType = .open, goalValue: Double? = nil, targetPaceMinPerKm: Double? = nil, hrZone: Int? = nil, repeatCount: Int = 1, groupId: Int = 0) {
        self.order = order
        self.stepTypeRaw = stepType.rawValue
        self.name = name
        self.goalTypeRaw = goalType.rawValue
        self.goalValue = goalValue
        self.targetPaceMinPerKm = targetPaceMinPerKm
        self.hrZone = hrZone
        self.repeatCount = repeatCount
        self.groupId = groupId
    }
}
