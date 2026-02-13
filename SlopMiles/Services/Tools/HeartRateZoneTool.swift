import Foundation

struct HeartRateZoneTool {
    struct HRZone {
        let number: Int
        let name: String
        let min: Int
        let max: Int
    }

    static func calculateZones(maxHR: Int? = nil, lthr: Int? = nil) -> [String: Any] {
        let zones: [HRZone]

        if let lthr = lthr {
            zones = [
                HRZone(number: 1, name: "Recovery", min: Int(Double(lthr) * 0.70), max: Int(Double(lthr) * 0.85)),
                HRZone(number: 2, name: "Aerobic", min: Int(Double(lthr) * 0.85), max: Int(Double(lthr) * 0.89)),
                HRZone(number: 3, name: "Tempo", min: Int(Double(lthr) * 0.90), max: Int(Double(lthr) * 0.94)),
                HRZone(number: 4, name: "Threshold", min: Int(Double(lthr) * 0.95), max: Int(Double(lthr) * 0.99)),
                HRZone(number: 5, name: "VO2max", min: Int(Double(lthr) * 1.00), max: Int(Double(lthr) * 1.06)),
            ]
        } else if let maxHR = maxHR {
            zones = [
                HRZone(number: 1, name: "Recovery", min: Int(Double(maxHR) * 0.50), max: Int(Double(maxHR) * 0.60)),
                HRZone(number: 2, name: "Aerobic", min: Int(Double(maxHR) * 0.60), max: Int(Double(maxHR) * 0.70)),
                HRZone(number: 3, name: "Tempo", min: Int(Double(maxHR) * 0.70), max: Int(Double(maxHR) * 0.80)),
                HRZone(number: 4, name: "Threshold", min: Int(Double(maxHR) * 0.80), max: Int(Double(maxHR) * 0.90)),
                HRZone(number: 5, name: "VO2max", min: Int(Double(maxHR) * 0.90), max: maxHR),
            ]
        } else {
            return ["error": "Either max_hr or lthr must be provided"]
        }

        var result: [String: Any] = [:]
        for zone in zones {
            result["zone\(zone.number)"] = [
                "min": zone.min,
                "max": zone.max,
                "name": zone.name,
            ]
        }
        return result
    }
}
