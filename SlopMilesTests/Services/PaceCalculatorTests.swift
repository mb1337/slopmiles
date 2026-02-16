import Testing
import Foundation
@testable import SlopMiles

@Suite("Pace Calculator Tests")
struct PaceCalculatorTests {
    @Test("Named easy intensity returns reasonable pace")
    func namedEasyPace() {
        let pace = PaceCalculator.pace(for: .named(.easy), vdot: 50.0)
        // VDOT 50 easy pace should be roughly 5.5–6.5 min/km
        #expect(pace > 5.0)
        #expect(pace < 7.0)
    }

    @Test("Named tempo intensity returns faster pace than easy")
    func namedTempoPace() {
        let easyPace = PaceCalculator.pace(for: .named(.easy), vdot: 50.0)
        let tempoPace = PaceCalculator.pace(for: .named(.tempo), vdot: 50.0)
        #expect(tempoPace < easyPace)
    }

    @Test("Named interval intensity returns faster pace than tempo")
    func namedIntervalPace() {
        let tempoPace = PaceCalculator.pace(for: .named(.tempo), vdot: 50.0)
        let intervalPace = PaceCalculator.pace(for: .named(.interval), vdot: 50.0)
        #expect(intervalPace < tempoPace)
    }

    @Test("Named repetition intensity returns fastest pace")
    func namedRepetitionPace() {
        let intervalPace = PaceCalculator.pace(for: .named(.interval), vdot: 50.0)
        let repPace = PaceCalculator.pace(for: .named(.repetition), vdot: 50.0)
        #expect(repPace < intervalPace)
    }

    @Test("VO2max percentage returns interpolated pace")
    func vo2maxInterpolation() {
        let easyPace = PaceCalculator.pace(for: .named(.easy), vdot: 50.0)
        let marathonPace = PaceCalculator.pace(for: .named(.marathon), vdot: 50.0)
        // 72% VO2max is between easy (65%) and marathon (80%)
        let interpolatedPace = PaceCalculator.pace(for: .vo2Max(72.0), vdot: 50.0)
        #expect(interpolatedPace < easyPace)
        #expect(interpolatedPace > marathonPace)
    }

    @Test("VO2max at boundary matches named intensity")
    func vo2maxBoundaryMatchesNamed() {
        // 65% VO2max should match easy pace
        let easyPace = PaceCalculator.pace(for: .named(.easy), vdot: 45.0)
        let vo2Easy = PaceCalculator.pace(for: .vo2Max(65.0), vdot: 45.0)
        #expect(abs(easyPace - vo2Easy) < 0.01)
    }

    @Test("VO2max below minimum clamps to easy")
    func vo2maxBelowMin() {
        let easyPace = PaceCalculator.pace(for: .named(.easy), vdot: 50.0)
        let lowVo2 = PaceCalculator.pace(for: .vo2Max(50.0), vdot: 50.0)
        #expect(abs(easyPace - lowVo2) < 0.01)
    }

    @Test("VO2max above maximum clamps to repetition")
    func vo2maxAboveMax() {
        let repPace = PaceCalculator.pace(for: .named(.repetition), vdot: 50.0)
        let highVo2 = PaceCalculator.pace(for: .vo2Max(110.0), vdot: 50.0)
        #expect(abs(repPace - highVo2) < 0.01)
    }

    @Test("Higher VDOT produces faster paces")
    func higherVdotFasterPace() {
        let pace40 = PaceCalculator.pace(for: .named(.easy), vdot: 40.0)
        let pace60 = PaceCalculator.pace(for: .named(.easy), vdot: 60.0)
        #expect(pace60 < pace40)
    }

    @Test("Format pace produces expected format")
    func formatPace() {
        #expect(PaceCalculator.formatPace(5.5) == "5:30")
        #expect(PaceCalculator.formatPace(4.0) == "4:00")
    }
}
