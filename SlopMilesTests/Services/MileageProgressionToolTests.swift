import Testing
@testable import SlopMiles

@Suite("Mileage Progression Tool Tests")
struct MileageProgressionToolTests {
    @Test("Safe progression under 10%")
    func safeProgression() {
        let distances = [30.0, 33.0, 36.0, 39.0]
        let result = MileageProgressionTool.check(weeklyDistancesKm: distances)
        #expect(result["safe"]!.boolValue! == true)
    }

    @Test("Unsafe jump flagged")
    func unsafeJump() {
        let distances = [30.0, 33.0, 40.0]
        let result = MileageProgressionTool.check(weeklyDistancesKm: distances)
        #expect(result["safe"]!.boolValue! == false)
        let warnings = result["warnings"]!.arrayValue!
        #expect(warnings.count == 1)
        let firstWarning = warnings[0].objectValue!
        #expect(firstWarning["week"]!.intValue! == 3)
    }

    @Test("Recovery week exception")
    func recoveryWeekException() {
        let distances = [40.0, 25.0, 40.0]
        let result = MileageProgressionTool.check(weeklyDistancesKm: distances)
        #expect(result["safe"]!.boolValue! == true)
    }

    @Test("Single week is safe")
    func singleWeek() {
        let result = MileageProgressionTool.check(weeklyDistancesKm: [30.0])
        #expect(result["safe"]!.boolValue! == true)
    }

    @Test("Empty array is safe")
    func emptyArray() {
        let result = MileageProgressionTool.check(weeklyDistancesKm: [])
        #expect(result["safe"]!.boolValue! == true)
    }
}
