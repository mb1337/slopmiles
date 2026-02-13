import Testing
@testable import SlopMiles

@Suite("Heart Rate Zone Tool Tests")
struct HeartRateZoneToolTests {
    @Test("Zones from max HR")
    func zonesFromMaxHR() {
        let result = HeartRateZoneTool.calculateZones(maxHR: 190)
        let zone1 = result["zone1"]!.objectValue!
        let zone5 = result["zone5"]!.objectValue!
        #expect(zone1["name"]!.stringValue! == "Recovery")
        #expect(zone5["name"]!.stringValue! == "VO2max")
        #expect(zone1["min"]!.intValue! == 95)
        #expect(zone1["max"]!.intValue! == 114)
        #expect(zone5["max"]!.intValue! == 190)
    }

    @Test("Zones from LTHR")
    func zonesFromLTHR() {
        let result = HeartRateZoneTool.calculateZones(lthr: 170)
        let zone4 = result["zone4"]!.objectValue!
        #expect(zone4["name"]!.stringValue! == "Threshold")
        #expect(zone4["min"]!.intValue! == 160)
        #expect(zone4["max"]!.intValue! == 168)
    }

    @Test("Error when no HR provided")
    func errorWhenNoHR() {
        let result = HeartRateZoneTool.calculateZones()
        #expect(result["error"] != nil)
    }

    @Test("All 5 zones present")
    func allZonesPresent() {
        let result = HeartRateZoneTool.calculateZones(maxHR: 185)
        for i in 1...5 { #expect(result["zone\(i)"] != nil) }
    }

    @Test("Zones from maxHR are contiguous")
    func zonesFromMaxHRAreContiguous() {
        let result = HeartRateZoneTool.calculateZones(maxHR: 190)
        for i in 1..<5 {
            let currentZone = result["zone\(i)"]!.objectValue!
            let nextZone = result["zone\(i + 1)"]!.objectValue!
            let currentMax = currentZone["max"]!.intValue!
            let nextMin = nextZone["min"]!.intValue!
            #expect(
                currentMax + 1 == nextMin,
                "Zone \(i) max (\(currentMax)) + 1 should equal zone \(i + 1) min (\(nextMin))"
            )
        }
    }

    @Test("Zones from LTHR are contiguous")
    func zonesFromLTHRAreContiguous() {
        let result = HeartRateZoneTool.calculateZones(lthr: 170)
        for i in 1..<5 {
            let currentZone = result["zone\(i)"]!.objectValue!
            let nextZone = result["zone\(i + 1)"]!.objectValue!
            let currentMax = currentZone["max"]!.intValue!
            let nextMin = nextZone["min"]!.intValue!
            #expect(
                currentMax + 1 == nextMin,
                "Zone \(i) max (\(currentMax)) + 1 should equal zone \(i + 1) min (\(nextMin))"
            )
        }
    }

    @Test("Zone 1 starts above zero and zone 5 ends at maxHR")
    func zoneBoundaries() {
        let maxHR = 200
        let result = HeartRateZoneTool.calculateZones(maxHR: maxHR)
        let zone1 = result["zone1"]!.objectValue!
        let zone5 = result["zone5"]!.objectValue!
        #expect(zone1["min"]!.intValue! > 0, "Zone 1 min should be above zero")
        #expect(zone5["max"]!.intValue! == maxHR, "Zone 5 max should equal maxHR")
    }

    @Test("All zone mins are less than their maxes")
    func zoneMinLessThanMax() {
        let result = HeartRateZoneTool.calculateZones(maxHR: 185)
        for i in 1...5 {
            let zone = result["zone\(i)"]!.objectValue!
            let min = zone["min"]!.intValue!
            let max = zone["max"]!.intValue!
            #expect(min < max, "Zone \(i) min (\(min)) should be less than max (\(max))")
        }
    }
}
