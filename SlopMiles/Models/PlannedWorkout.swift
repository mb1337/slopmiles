import Foundation
import SwiftData

enum WorkoutIntensity: String, Codable, CaseIterable, Sendable {
    case easy
    case marathon
    case tempo       // maps to VDOT threshold
    case interval
    case repetition  // "repeat" in AI-facing JSON

    var displayName: String {
        switch self {
        case .easy: return "Easy"
        case .marathon: return "Marathon"
        case .tempo: return "Tempo"
        case .interval: return "Interval"
        case .repetition: return "Repetition"
        }
    }
}

/// Unified intensity: either a named VDOT level or a specific %VO2max
enum IntensityTarget: Equatable, Sendable {
    case named(WorkoutIntensity)
    case vo2Max(Double)  // e.g. 96.0 = 96% VO2max

    var displayName: String {
        switch self {
        case .named(let i): return i.displayName
        case .vo2Max(let pct): return "\(Int(pct))% VO2max"
        }
    }

    /// Encode to raw string for SwiftData storage.
    var rawValue: String {
        switch self {
        case .named(let i): return i.rawValue
        case .vo2Max(let p): return "vo2:\(p)"
        }
    }

    /// Decode from raw string stored in SwiftData.
    init(rawValue: String) {
        if rawValue.hasPrefix("vo2:"),
           let pct = Double(String(rawValue.dropFirst(4))) {
            self = .vo2Max(pct)
        } else {
            self = .named(WorkoutIntensity(rawValue: rawValue) ?? .easy)
        }
    }
}

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

struct LinkedWorkoutEntry: Codable, Sendable, Equatable {
    let healthKitWorkoutID: String
    let distanceKm: Double
    let durationMinutes: Double
}

@Model
final class PlannedWorkout {
    var id: UUID = UUID()
    var name: String = ""
    var workoutTypeRaw: String = WorkoutType.easy.rawValue
    var scheduledDate: Date = Date()
    var dailyVolumePercent: Double = 0
    var intensityRaw: String = WorkoutIntensity.easy.rawValue
    var distanceKm: Double = 0
    var durationMinutes: Double = 0
    var targetPaceMinPerKm: Double?
    var completionStatusRaw: String = WorkoutCompletionStatus.planned.rawValue
    var watchScheduleID: String?
    var locationRaw: String = WorkoutLocation.outdoor.rawValue
    var notes: String = ""
    var linkedWorkoutsJSON: String = "[]"

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

    var intensityTarget: IntensityTarget {
        get { IntensityTarget(rawValue: intensityRaw) }
        set { intensityRaw = newValue.rawValue }
    }

    var sortedSteps: [PlannedWorkoutStep] {
        (steps ?? []).sorted { $0.order < $1.order }
    }

    var linkedWorkouts: [LinkedWorkoutEntry] {
        get {
            guard let data = linkedWorkoutsJSON.data(using: .utf8),
                  let entries = try? JSONDecoder().decode([LinkedWorkoutEntry].self, from: data) else {
                return []
            }
            return entries
        }
        set {
            if let data = try? JSONEncoder().encode(newValue) {
                linkedWorkoutsJSON = String(data: data, encoding: .utf8) ?? "[]"
            }
        }
    }

    var isLinkedToHealthKit: Bool {
        !linkedWorkouts.isEmpty
    }

    var actualDistanceKm: Double {
        linkedWorkouts.reduce(0) { $0 + $1.distanceKm }
    }

    var actualDurationMinutes: Double {
        linkedWorkouts.reduce(0) { $0 + $1.durationMinutes }
    }

    var actualPaceMinPerKm: Double? {
        let dist = actualDistanceKm
        guard dist > 0 else { return nil }
        return actualDurationMinutes / dist
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
