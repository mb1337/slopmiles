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

    @Test("Single week is safe with empty warnings")
    func singleWeek() {
        let result = MileageProgressionTool.check(weeklyDistancesKm: [30.0])
        #expect(result["safe"]!.boolValue! == true)
        let warnings = result["warnings"]!.arrayValue!
        #expect(warnings.isEmpty, "Single week should produce no warnings")
    }

    @Test("Empty array is safe with empty warnings")
    func emptyArray() {
        let result = MileageProgressionTool.check(weeklyDistancesKm: [])
        #expect(result["safe"]!.boolValue! == true)
        let warnings = result["warnings"]!.arrayValue!
        #expect(warnings.isEmpty, "Empty input should produce no warnings")
    }

    @Test("Exactly 10% increase is safe")
    func exactlyTenPercent() {
        // 30 -> 33 is exactly 10%, should be safe (> 10 triggers, not >=)
        let distances = [30.0, 33.0]
        let result = MileageProgressionTool.check(weeklyDistancesKm: distances)
        #expect(result["safe"]!.boolValue! == true, "Exactly 10% increase should be safe")
        let warnings = result["warnings"]!.arrayValue!
        #expect(warnings.isEmpty)
    }

    @Test("Just over 10% increase is unsafe")
    func justOverTenPercent() {
        // 30 -> 33.1 is ~10.3%, should be flagged
        let distances = [30.0, 33.1]
        let result = MileageProgressionTool.check(weeklyDistancesKm: distances)
        #expect(result["safe"]!.boolValue! == false, "10.3% increase should be flagged")
        let warnings = result["warnings"]!.arrayValue!
        #expect(warnings.count == 1)
        let warning = warnings[0].objectValue!
        #expect(warning["week"]!.intValue! == 2)
        let pct = warning["increase_pct"]!.doubleValue!
        #expect(pct > 10.0 && pct < 11.0, "Increase should be ~10.3%, got \(pct)%")
    }

    @Test("Recovery bounce-back within pre-recovery baseline is safe")
    func recoveryBounceBackWithinBaseline() {
        // 40 -> 25 (recovery: -37.5%) -> 40 (back to baseline, +60% vs recovery but <= 10% vs pre-recovery)
        let distances = [40.0, 25.0, 40.0]
        let result = MileageProgressionTool.check(weeklyDistancesKm: distances)
        #expect(result["safe"]!.boolValue! == true, "Returning to pre-recovery mileage should be safe")
    }

    @Test("Recovery bounce-back exceeding pre-recovery baseline is unsafe")
    func recoveryBounceBackExceedingBaseline() {
        // 40 -> 25 (recovery: -37.5%) -> 45 (+12.5% vs pre-recovery 40)
        let distances = [40.0, 25.0, 45.0]
        let result = MileageProgressionTool.check(weeklyDistancesKm: distances)
        #expect(result["safe"]!.boolValue! == false, "Exceeding pre-recovery baseline by >10% should be flagged")
        let warnings = result["warnings"]!.arrayValue!
        #expect(warnings.count == 1)
        #expect(warnings[0].objectValue!["week"]!.intValue! == 3)
    }

    @Test("Warning message contains useful detail")
    func warningMessageDetail() {
        let distances = [30.0, 40.0]
        let result = MileageProgressionTool.check(weeklyDistancesKm: distances)
        let warnings = result["warnings"]!.arrayValue!
        #expect(warnings.count == 1)
        let message = warnings[0].objectValue!["message"]!.stringValue!
        #expect(message.contains("30.0"), "Warning should mention the starting distance")
        #expect(message.contains("40.0"), "Warning should mention the ending distance")
        #expect(message.contains("10%"), "Warning should mention the 10% recommendation")
    }

    @Test("Multiple unsafe jumps produce multiple warnings")
    func multipleUnsafeJumps() {
        // 20 -> 25 (+25%) -> 32 (+28%)
        let distances = [20.0, 25.0, 32.0]
        let result = MileageProgressionTool.check(weeklyDistancesKm: distances)
        #expect(result["safe"]!.boolValue! == false)
        let warnings = result["warnings"]!.arrayValue!
        #expect(warnings.count == 2, "Both jumps should be flagged, got \(warnings.count)")
        #expect(warnings[0].objectValue!["week"]!.intValue! == 2)
        #expect(warnings[1].objectValue!["week"]!.intValue! == 3)
    }
}
