import Foundation

struct UnitConverter {
    static func kmToMiles(_ km: Double) -> Double {
        km / Constants.kmPerMile
    }

    static func milesToKm(_ miles: Double) -> Double {
        miles * Constants.kmPerMile
    }

    static func minPerKmToMinPerMile(_ minPerKm: Double) -> Double {
        minPerKm * Constants.kmPerMile
    }

    static func minPerMileToMinPerKm(_ minPerMile: Double) -> Double {
        minPerMile / Constants.kmPerMile
    }

    static func formatDistance(_ km: Double, unit: UnitPreference) -> String {
        switch unit {
        case .metric:
            return String(format: "%.1f km", km)
        case .imperial:
            return String(format: "%.1f mi", kmToMiles(km))
        }
    }

    static func formatPace(_ minPerKm: Double, unit: UnitPreference) -> String {
        let pace: Double
        let label: String
        switch unit {
        case .metric:
            pace = minPerKm
            label = "/km"
        case .imperial:
            pace = minPerKmToMinPerMile(minPerKm)
            label = "/mi"
        }
        let totalSeconds = Int((pace * 60).rounded())
        let minutes = totalSeconds / 60
        let seconds = totalSeconds % 60
        return String(format: "%d:%02d%@", minutes, seconds, label)
    }

    static func formatDuration(minutes: Double) -> String {
        let hours = Int(minutes) / 60
        let mins = Int(minutes) % 60
        if hours > 0 {
            return "\(hours)h \(mins)m"
        }
        return "\(mins)m"
    }
}
