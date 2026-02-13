import Foundation

struct MileageProgressionTool {
    static func check(weeklyDistancesKm: [Double]) -> [String: JSONValue] {
        guard weeklyDistancesKm.count >= 2 else {
            return ["safe": true, "warnings": .array([])]
        }

        var warnings: [JSONValue] = []
        var preRecoveryDistance: Double?

        for i in 1..<weeklyDistancesKm.count {
            let prev = weeklyDistancesKm[i - 1]
            let curr = weeklyDistancesKm[i]

            guard prev > 0 else { continue }

            let changePct = ((curr - prev) / prev) * 100

            // Check if previous week was a recovery week (30%+ drop)
            if i >= 2 {
                let prePrev = weeklyDistancesKm[i - 2]
                if prePrev > 0 {
                    let prevChange = ((prev - prePrev) / prePrev) * 100
                    if prevChange <= -30 {
                        preRecoveryDistance = prePrev
                    }
                }
            }

            if changePct > 10 {
                // If coming back from recovery, compare against pre-recovery week
                if let preRecovery = preRecoveryDistance {
                    let vsPreRecovery = ((curr - preRecovery) / preRecovery) * 100
                    if vsPreRecovery <= 10 {
                        preRecoveryDistance = nil
                        continue
                    }
                }

                warnings.append(.object([
                    "week": .int(i + 1),
                    "increase_pct": .number(round(changePct * 10) / 10),
                    "message": .string("Week \(i + 1) increases \(round(changePct * 10) / 10)% over week \(i) (\(round(prev * 10) / 10) km → \(round(curr * 10) / 10) km). Recommended max is 10%."),
                ]))
            }

            if changePct > -30 {
                preRecoveryDistance = nil
            }
        }

        return [
            "safe": .bool(warnings.isEmpty),
            "warnings": .array(warnings),
        ]
    }
}
