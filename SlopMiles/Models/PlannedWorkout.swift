import Foundation
import SwiftData

enum WorkoutType: String, Codable, CaseIterable {
    case easy
    case tempo
    case interval
    case long
    case recovery
    case race
    case rest

    var displayName: String {
        switch self {
        case .easy: return "Easy Run"
        case .tempo: return "Tempo Run"
        case .interval: return "Intervals"
        case .long: return "Long Run"
        case .recovery: return "Recovery Run"
        case .race: return "Race"
        case .rest: return "Rest Day"
        }
    }

    var iconName: String {
        switch self {
        case .easy: return "figure.run"
        case .tempo: return "gauge.with.needle"
        case .interval: return "bolt.fill"
        case .long: return "road.lanes"
        case .recovery: return "heart.fill"
        case .race: return "flag.checkered"
        case .rest: return "bed.double.fill"
        }
    }
}

enum WorkoutCompletionStatus: String, Codable {
    case planned
    case scheduled
    case completed
    case skipped
}

enum WorkoutLocation: String, Codable {
    case outdoor
    case treadmill
    case track
    case trail
}

@Model
final class PlannedWorkout {
    var id: UUID = UUID()
    var name: String = ""
    var workoutTypeRaw: String = WorkoutType.easy.rawValue
    var scheduledDate: Date = Date()
    var distanceKm: Double = 0
    var durationMinutes: Double = 0
    var targetPaceMinPerKm: Double?
    var completionStatusRaw: String = WorkoutCompletionStatus.planned.rawValue
    var watchScheduleID: String?
    var locationRaw: String = WorkoutLocation.outdoor.rawValue
    var notes: String = ""

    var week: TrainingWeek?

    @Relationship(deleteRule: .cascade, inverse: \PlannedWorkoutStep.workout)
    var steps: [PlannedWorkoutStep]? = []

    var workoutType: WorkoutType {
        get { WorkoutType(rawValue: workoutTypeRaw) ?? .easy }
        set { workoutTypeRaw = newValue.rawValue }
    }

    var completionStatus: WorkoutCompletionStatus {
        get { WorkoutCompletionStatus(rawValue: completionStatusRaw) ?? .planned }
        set { completionStatusRaw = newValue.rawValue }
    }

    var location: WorkoutLocation {
        get { WorkoutLocation(rawValue: locationRaw) ?? .outdoor }
        set { locationRaw = newValue.rawValue }
    }

    var sortedSteps: [PlannedWorkoutStep] {
        (steps ?? []).sorted { $0.order < $1.order }
    }

    init() {}

    init(name: String, workoutType: WorkoutType, scheduledDate: Date, distanceKm: Double = 0, durationMinutes: Double = 0, targetPaceMinPerKm: Double? = nil, location: WorkoutLocation = .outdoor) {
        self.name = name
        self.workoutTypeRaw = workoutType.rawValue
        self.scheduledDate = scheduledDate
        self.distanceKm = distanceKm
        self.durationMinutes = durationMinutes
        self.targetPaceMinPerKm = targetPaceMinPerKm
        self.locationRaw = location.rawValue
    }
}
