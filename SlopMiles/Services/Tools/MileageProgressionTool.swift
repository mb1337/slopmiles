import Foundation

struct MileageProgressionTool {
    static func check(weeklyDistancesKm: [Double]) -> [String: JSONValue] {
        checkProgression(weeklyValues: weeklyDistancesKm, unitLabel: "km")
    }

    static func checkDuration(weeklyDurationsMinutes: [Double]) -> [String: JSONValue] {
        checkProgression(weeklyValues: weeklyDurationsMinutes, unitLabel: "min")
    }

    private static func checkProgression(weeklyValues: [Double], unitLabel: String) -> [String: JSONValue] {
        guard weeklyValues.count >= 2 else {
            return ["safe": true, "warnings": .array([])]
        }

        var warnings: [JSONValue] = []
        var preRecoveryValue: Double?

        for i in 1..<weeklyValues.count {
            let prev = weeklyValues[i - 1]
            let curr = weeklyValues[i]

            guard prev > 0 else { continue }

            let changePct = ((curr - prev) / prev) * 100

            // Check if previous week was a recovery week (30%+ drop)
            if i >= 2 {
                let prePrev = weeklyValues[i - 2]
                if prePrev > 0 {
                    let prevChange = ((prev - prePrev) / prePrev) * 100
                    if prevChange <= -30 {
                        preRecoveryValue = prePrev
                    }
                }
            }

            if changePct > 10 {
                // If coming back from recovery, compare against pre-recovery week
                if let preRecovery = preRecoveryValue {
                    let vsPreRecovery = ((curr - preRecovery) / preRecovery) * 100
                    if vsPreRecovery <= 10 {
                        preRecoveryValue = nil
                        continue
                    }
                }

                warnings.append(.object([
                    "week": .int(i + 1),
                    "increase_pct": .number(round(changePct * 10) / 10),
                    "message": .string("Week \(i + 1) increases \(round(changePct * 10) / 10)% over week \(i) (\(round(prev * 10) / 10) \(unitLabel) → \(round(curr * 10) / 10) \(unitLabel)). Recommended max is 10%."),
                ]))
            }

            if changePct > -30 {
                preRecoveryValue = nil
            }
        }

        return [
            "safe": .bool(warnings.isEmpty),
            "warnings": .array(warnings),
        ]
    }
}
