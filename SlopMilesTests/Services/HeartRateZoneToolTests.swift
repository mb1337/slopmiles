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
}
