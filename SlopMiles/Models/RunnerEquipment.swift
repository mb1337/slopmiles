import Foundation
import SwiftData

enum IndoorOutdoorPreference: String, Codable, CaseIterable {
    case preferOutdoor
    case preferIndoor
    case noPreference

    var displayName: String {
        switch self {
        case .preferOutdoor: return "Prefer Outdoor"
        case .preferIndoor: return "Prefer Indoor"
        case .noPreference: return "No Preference"
        }
    }
}

@Model
final class RunnerEquipment {
    var id: UUID = UUID()
    var hasTreadmill: Bool = false
    var hasTrackAccess: Bool = false
    var hasTrailAccess: Bool = false
    var hasGymAccess: Bool = false
    var indoorOutdoorPreferenceRaw: String = IndoorOutdoorPreference.preferOutdoor.rawValue
    var terrainNotes: String = ""

    var indoorOutdoorPreference: IndoorOutdoorPreference {
        get { IndoorOutdoorPreference(rawValue: indoorOutdoorPreferenceRaw) ?? .preferOutdoor }
        set { indoorOutdoorPreferenceRaw = newValue.rawValue }
    }

    init() {}

    func dictionaryForPrompt() -> [String: Any] {
        var dict: [String: Any] = [
            "treadmill_available": hasTreadmill,
            "track_available": hasTrackAccess,
            "trail_available": hasTrailAccess,
            "gym_available": hasGymAccess,
            "preference": indoorOutdoorPreference.rawValue,
        ]
        if !terrainNotes.isEmpty {
            dict["terrain_notes"] = terrainNotes
        }
        return dict
    }
}
