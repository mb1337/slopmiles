import Foundation

struct HeartRateZoneTool {
    struct HRZone {
        let number: Int
        let name: String
        let min: Int
        let max: Int
    }

    static func calculateZones(maxHR: Int? = nil, lthr: Int? = nil) -> [String: JSONValue] {
        let zones: [HRZone]

        if let lthr = lthr {
            let hr = Double(lthr)
            let thresholds = [
                Int(hr * 0.70),  // Zone 1 min
                Int(hr * 0.85),  // Zone 1 max / Zone 2 boundary
                Int(hr * 0.89),  // Zone 2 max / Zone 3 boundary
                Int(hr * 0.94),  // Zone 3 max / Zone 4 boundary
                Int(hr * 0.99),  // Zone 4 max / Zone 5 boundary
                Int(hr * 1.06),  // Zone 5 max
            ]
            let names = ["Recovery", "Aerobic", "Tempo", "Threshold", "VO2max"]
            zones = (0..<5).map { i in
                HRZone(number: i + 1, name: names[i],
                       min: i == 0 ? thresholds[0] : thresholds[i] + 1,
                       max: thresholds[i + 1])
            }
        } else if let maxHR = maxHR {
            let hr = Double(maxHR)
            let thresholds = [
                Int(hr * 0.50),  // Zone 1 min
                Int(hr * 0.60),  // Zone 1 max / Zone 2 boundary
                Int(hr * 0.70),  // Zone 2 max / Zone 3 boundary
                Int(hr * 0.80),  // Zone 3 max / Zone 4 boundary
                Int(hr * 0.90),  // Zone 4 max / Zone 5 boundary
            ]
            let names = ["Recovery", "Aerobic", "Tempo", "Threshold", "VO2max"]
            zones = (0..<5).map { i in
                HRZone(number: i + 1, name: names[i],
                       min: i == 0 ? thresholds[0] : thresholds[i] + 1,
                       max: i == 4 ? maxHR : thresholds[i + 1])
            }
        } else {
            return ["error": "Either max_hr or lthr must be provided"]
        }

        var result: [String: JSONValue] = [:]
        for zone in zones {
            result["zone\(zone.number)"] = .object([
                "min": .int(zone.min),
                "max": .int(zone.max),
                "name": .string(zone.name),
            ])
        }
        return result
    }
}
