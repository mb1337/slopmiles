import Foundation
import SwiftData

enum ExperienceLevel: String, Codable, CaseIterable {
    case beginner
    case intermediate
    case advanced
    case elite

    var displayName: String {
        rawValue.capitalized
    }
}

enum VolumeType: String, Codable, CaseIterable {
    case distance
    case time

    var displayName: String {
        switch self {
        case .distance: return "Distance"
        case .time: return "Time"
        }
    }
}

enum UnitPreference: String, Codable, CaseIterable {
    case metric
    case imperial

    var distanceLabel: String {
        switch self {
        case .metric: return "km"
        case .imperial: return "mi"
        }
    }

    var paceLabel: String {
        switch self {
        case .metric: return "min/km"
        case .imperial: return "min/mi"
        }
    }
}

@Model
final class UserProfile {
    var id: UUID = UUID()
    var experienceLevelRaw: String = ExperienceLevel.intermediate.rawValue
    var currentWeeklyMileageKm: Double = 0
    var unitPreferenceRaw: String = UnitPreference.metric.rawValue
    var volumeTypeRaw: String = VolumeType.distance.rawValue
    var currentWeeklyVolumeMinutes: Double = 0
    var injuryNotes: String = ""
    var homeLatitude: Double?
    var homeLongitude: Double?
    var maxHeartRate: Int?
    var restingHeartRate: Int?
    var lactateThresholdHR: Int?

    var experienceLevel: ExperienceLevel {
        get { ExperienceLevel(rawValue: experienceLevelRaw) ?? .intermediate }
        set { experienceLevelRaw = newValue.rawValue }
    }

    var unitPreference: UnitPreference {
        get { UnitPreference(rawValue: unitPreferenceRaw) ?? .metric }
        set { unitPreferenceRaw = newValue.rawValue }
    }

    var volumeType: VolumeType {
        get { VolumeType(rawValue: volumeTypeRaw) ?? .distance }
        set { volumeTypeRaw = newValue.rawValue }
    }

    var hasLocation: Bool {
        homeLatitude != nil && homeLongitude != nil
    }

    init() {}
}
