import Foundation

struct RunningStats: Sendable {
    var averageWeeklyDistanceKm: Double = 0
    var averagePaceMinPerKm: Double = 0
    var averageHeartRate: Double?
    var estimatedVO2Max: Double?
    var totalRunsLast30Days: Int = 0
    var longestRunKm: Double = 0
    var recentRaces: [RaceResult] = []
    var weeklyDistancesKm: [Double] = []

    struct RaceResult: Sendable {
        var distanceMeters: Double
        var timeSeconds: Double
        var date: Date
    }

    func dictionaryForPrompt() -> [String: JSONValue] {
        var dict: [String: JSONValue] = [
            "average_weekly_distance_km": .number(round(averageWeeklyDistanceKm * 10) / 10),
            "average_pace_min_per_km": .number(round(averagePaceMinPerKm * 100) / 100),
            "total_runs_last_30_days": .int(totalRunsLast30Days),
            "longest_run_km": .number(round(longestRunKm * 10) / 10),
            "weekly_distances_last_8_weeks_km": .array(weeklyDistancesKm.map { .number(round($0 * 10) / 10) }),
        ]
        if let hr = averageHeartRate {
            dict["average_heart_rate"] = .int(Int(hr))
        }
        if let vo2 = estimatedVO2Max {
            dict["estimated_vo2max"] = .number(round(vo2 * 10) / 10)
        }
        if !recentRaces.isEmpty {
            dict["recent_races"] = .array(recentRaces.map {
                .object(["distance_meters": .number($0.distanceMeters), "time_seconds": .number($0.timeSeconds)])
            })
        }
        return dict
    }
}
