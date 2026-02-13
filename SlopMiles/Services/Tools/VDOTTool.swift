import Foundation
import VDotCalculator

struct VDOTTool {
    static func calculateVDOT(raceDistanceMeters: Double, raceTimeSeconds: Double) -> [String: Any] {
        let distance = Measurement<UnitLength>(value: raceDistanceMeters, unit: .meters)
        let vdot = Vdot(raceDistance: distance, raceTime: raceTimeSeconds)
        return ["vdot": round(vdot.value * 10) / 10]
    }

    static func getTrainingPaces(vdot vdotValue: Double) -> [String: Any] {
        let v = Vdot(value: vdotValue)
        let intensities: [(String, Vdot.TrainingIntensity)] = [
            ("easy", .easy),
            ("marathon", .marathon),
            ("threshold", .threshold),
            ("interval", .interval),
            ("repetition", .repetition),
        ]
        var paces: [String: Any] = [:]
        for (name, intensity) in intensities {
            let velocity = v.trainingVelocity(intensity: intensity)
            let metersPerSecond = velocity.converted(to: .metersPerSecond).value
            let minPerKm = (1000.0 / metersPerSecond) / 60.0
            paces["\(name)_min_per_km"] = round(minPerKm * 100) / 100
            paces["\(name)_formatted"] = formatPace(minPerKm)
        }
        return paces
    }

    static func projectRaceTime(vdot vdotValue: Double, distanceMeters: Double) -> [String: Any] {
        let v = Vdot(value: vdotValue)
        let distance = Measurement<UnitLength>(value: distanceMeters, unit: .meters)
        let seconds = v.projectedRaceTime(distance: distance)
        return [
            "projected_time_seconds": round(seconds * 10) / 10,
            "projected_time_formatted": formatDuration(seconds),
        ]
    }

    static func formatPace(_ minPerKm: Double) -> String {
        let totalSeconds = Int(minPerKm * 60)
        let minutes = totalSeconds / 60
        let seconds = totalSeconds % 60
        return String(format: "%d:%02d", minutes, seconds)
    }

    static func formatDuration(_ totalSeconds: Double) -> String {
        let hours = Int(totalSeconds) / 3600
        let minutes = (Int(totalSeconds) % 3600) / 60
        let seconds = Int(totalSeconds) % 60
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, seconds)
        }
        return String(format: "%d:%02d", minutes, seconds)
    }
}
