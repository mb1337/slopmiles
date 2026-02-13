import Testing
@testable import SlopMiles

@Suite("VDOT Tool Tests")
struct VDOTToolTests {
    @Test("Calculate VDOT from 5K race")
    func calculateVDOTFrom5K() {
        // 20:00 5K should yield VDOT ~49.8
        let result = VDOTTool.calculateVDOT(raceDistanceMeters: 5000, raceTimeSeconds: 1200)
        let vdot = result["vdot"]!.doubleValue!
        #expect(vdot >= 48 && vdot <= 52, "20:00 5K VDOT should be ~49.8, got \(vdot)")
    }

    @Test("Calculate VDOT from half marathon")
    func calculateVDOTFromHalfMarathon() {
        // 1:30:00 half marathon should yield VDOT ~50.5
        let result = VDOTTool.calculateVDOT(raceDistanceMeters: 21097.5, raceTimeSeconds: 5400)
        let vdot = result["vdot"]!.doubleValue!
        #expect(vdot >= 49 && vdot <= 52, "1:30 half VDOT should be ~50.5, got \(vdot)")
    }

    @Test("Get training paces returns all 5 intensities")
    func getTrainingPacesReturnsAllIntensities() {
        let result = VDOTTool.getTrainingPaces(vdot: 50)
        #expect(result["easy_min_per_km"] != nil)
        #expect(result["marathon_min_per_km"] != nil)
        #expect(result["threshold_min_per_km"] != nil)
        #expect(result["interval_min_per_km"] != nil)
        #expect(result["repetition_min_per_km"] != nil)

        let easy = result["easy_min_per_km"]!.doubleValue!
        let threshold = result["threshold_min_per_km"]!.doubleValue!
        let repetition = result["repetition_min_per_km"]!.doubleValue!
        #expect(easy > threshold)
        #expect(threshold > repetition)
    }

    @Test("Training paces are formatted")
    func trainingPacesFormatted() {
        let result = VDOTTool.getTrainingPaces(vdot: 50)
        let formatted = result["easy_formatted"]!.stringValue!
        #expect(formatted.contains(":"))
    }

    @Test("Project race time for marathon")
    func projectMarathonTime() {
        // VDOT 50 marathon ~3:10:40 (~11440 seconds)
        let result = VDOTTool.projectRaceTime(vdot: 50, distanceMeters: 42195)
        let seconds = result["projected_time_seconds"]!.doubleValue!
        let formatted = result["projected_time_formatted"]!.stringValue!
        #expect(seconds >= 11000 && seconds <= 12000, "VDOT 50 marathon should be ~3:10, got \(seconds)s")
        #expect(formatted.contains(":"))
        // Should be in 3:xx:xx format
        #expect(formatted.hasPrefix("3:"), "Marathon time for VDOT 50 should start with 3:, got \(formatted)")
    }

    @Test("Training paces have correct relative ordering and plausible values")
    func trainingPacesPlausibleValues() {
        // VDOT 50: easy ~5:30-6:00/km, threshold ~4:15-4:30/km, repetition ~3:40-3:55/km
        let result = VDOTTool.getTrainingPaces(vdot: 50)
        let easy = result["easy_min_per_km"]!.doubleValue!
        let marathon = result["marathon_min_per_km"]!.doubleValue!
        let threshold = result["threshold_min_per_km"]!.doubleValue!
        let interval = result["interval_min_per_km"]!.doubleValue!
        let repetition = result["repetition_min_per_km"]!.doubleValue!

        // Verify ordering: easy > marathon > threshold > interval > repetition
        #expect(easy > marathon, "Easy pace should be slower than marathon pace")
        #expect(marathon > threshold, "Marathon pace should be slower than threshold pace")
        #expect(threshold > interval, "Threshold pace should be slower than interval pace")
        #expect(interval > repetition, "Interval pace should be slower than repetition pace")

        // Verify plausible ranges (min/km)
        #expect(easy >= 5.0 && easy <= 6.5, "VDOT 50 easy pace should be ~5:30/km, got \(easy)")
        #expect(threshold >= 4.0 && threshold <= 4.7, "VDOT 50 threshold should be ~4:15/km, got \(threshold)")
        #expect(repetition >= 3.4 && repetition <= 4.1, "VDOT 50 rep pace should be ~3:45/km, got \(repetition)")
    }

    @Test("Format pace")
    func formatPace() {
        let formatted = VDOTTool.formatPace(5.5)
        #expect(formatted == "5:30")
    }

    @Test("Format duration hours")
    func formatDurationWithHours() {
        let formatted = VDOTTool.formatDuration(7384)
        #expect(formatted == "2:03:04")
    }

    @Test("Format duration minutes only")
    func formatDurationMinutesOnly() {
        let formatted = VDOTTool.formatDuration(1234)
        #expect(formatted == "20:34")
    }
}
