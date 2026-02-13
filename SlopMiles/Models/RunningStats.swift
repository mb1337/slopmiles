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

    func dictionaryForPrompt() -> [String: Any] {
        var dict: [String: Any] = [
            "average_weekly_distance_km": round(averageWeeklyDistanceKm * 10) / 10,
            "average_pace_min_per_km": round(averagePaceMinPerKm * 100) / 100,
            "total_runs_last_30_days": totalRunsLast30Days,
            "longest_run_km": round(longestRunKm * 10) / 10,
            "weekly_distances_last_8_weeks_km": weeklyDistancesKm.map { round($0 * 10) / 10 },
        ]
        if let hr = averageHeartRate {
            dict["average_heart_rate"] = Int(hr)
        }
        if let vo2 = estimatedVO2Max {
            dict["estimated_vo2max"] = round(vo2 * 10) / 10
        }
        if !recentRaces.isEmpty {
            dict["recent_races"] = recentRaces.map {
                ["distance_meters": $0.distanceMeters, "time_seconds": $0.timeSeconds]
            }
        }
        return dict
    }
}
