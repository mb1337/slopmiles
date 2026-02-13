import Testing
@testable import SlopMiles

@Suite("Heart Rate Zone Tool Tests")
struct HeartRateZoneToolTests {
    @Test("Zones from max HR")
    func zonesFromMaxHR() {
        let result = HeartRateZoneTool.calculateZones(maxHR: 190)
        let zone1 = result["zone1"] as! [String: Any]
        let zone5 = result["zone5"] as! [String: Any]
        #expect(zone1["name"] as! String == "Recovery")
        #expect(zone5["name"] as! String == "VO2max")
        #expect(zone1["min"] as! Int == 95)
        #expect(zone1["max"] as! Int == 114)
        #expect(zone5["max"] as! Int == 190)
    }

    @Test("Zones from LTHR")
    func zonesFromLTHR() {
        let result = HeartRateZoneTool.calculateZones(lthr: 170)
        let zone4 = result["zone4"] as! [String: Any]
        #expect(zone4["name"] as! String == "Threshold")
        #expect(zone4["min"] as! Int == 161)
        #expect(zone4["max"] as! Int == 168)
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
