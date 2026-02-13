import Testing
@testable import SlopMiles

@Suite("VDOT Tool Tests")
struct VDOTToolTests {
    @Test("Calculate VDOT from 5K race")
    func calculateVDOTFrom5K() {
        let result = VDOTTool.calculateVDOT(raceDistanceMeters: 5000, raceTimeSeconds: 1200)
        let vdot = result["vdot"]!.doubleValue!
        #expect(vdot > 40 && vdot < 50)
    }

    @Test("Calculate VDOT from half marathon")
    func calculateVDOTFromHalfMarathon() {
        let result = VDOTTool.calculateVDOT(raceDistanceMeters: 21097.5, raceTimeSeconds: 5400)
        let vdot = result["vdot"]!.doubleValue!
        #expect(vdot > 48 && vdot < 54)
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
        let result = VDOTTool.projectRaceTime(vdot: 50, distanceMeters: 42195)
        let seconds = result["projected_time_seconds"]!.doubleValue!
        let formatted = result["projected_time_formatted"]!.stringValue!
        #expect(seconds > 10000 && seconds < 15000)
        #expect(formatted.contains(":"))
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
