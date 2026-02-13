import Foundation

struct PaceConverterTool {
    enum PaceUnit: String {
        case minPerKm = "min_per_km"
        case minPerMile = "min_per_mile"
        case kmPerHour = "km_per_hour"
        case mph = "mph"
    }

    static let kmPerMile = 1.60934

    static func convert(value: Double, from fromUnit: String, to toUnit: String) -> [String: JSONValue] {
        guard value > 0 else {
            return ["error": "Value must be greater than 0"]
        }

        guard let from = PaceUnit(rawValue: fromUnit),
              let to = PaceUnit(rawValue: toUnit) else {
            return ["error": "Invalid unit. Use: min_per_km, min_per_mile, km_per_hour, mph"]
        }

        let minPerKm: Double = switch from {
        case .minPerKm: value
        case .minPerMile: value / kmPerMile
        case .kmPerHour: 60.0 / value
        case .mph: 60.0 / (value * kmPerMile)
        }

        let result: Double = switch to {
        case .minPerKm: minPerKm
        case .minPerMile: minPerKm * kmPerMile
        case .kmPerHour: 60.0 / minPerKm
        case .mph: 60.0 / (minPerKm * kmPerMile)
        }

        let rounded = round(result * 100) / 100
        return [
            "result": .number(rounded),
            "formatted": .string(formatResult(rounded, unit: to)),
        ]
    }

    private static func formatResult(_ value: Double, unit: PaceUnit) -> String {
        switch unit {
        case .minPerKm, .minPerMile:
            let totalSeconds = Int(value * 60)
            let minutes = totalSeconds / 60
            let seconds = totalSeconds % 60
            return String(format: "%d:%02d %@", minutes, seconds, unit == .minPerKm ? "/km" : "/mi")
        case .kmPerHour:
            return String(format: "%.1f km/h", value)
        case .mph:
            return String(format: "%.1f mph", value)
        }
    }
}
