import Foundation
import VDotCalculator

struct PaceCalculator {
    /// Known approximate %VO2max for each named intensity.
    private static let vo2maxPercents: [Double] = [65.0, 80.0, 88.0, 98.0, 105.0]
    private static let vo2maxIntensities: [WorkoutIntensity] = [.easy, .marathon, .tempo, .interval, .repetition]

    /// Returns pace in min/km for an intensity target at a given VDOT.
    /// For named intensities, uses VDotCalculator directly.
    /// For %VO2max, interpolates between known VDOT intensity paces.
    static func pace(for target: IntensityTarget, vdot: Double) -> Double {
        let v = Vdot(value: vdot)

        switch target {
        case .named(let intensity):
            return velocityToMinPerKm(v.trainingVelocity(intensity: vdotIntensity(for: intensity)))

        case .vo2Max(let targetPct):
            // Build lookup of (vo2%, pace) pairs from this runner's VDOT
            let vdotIntensities: [Vdot.TrainingIntensity] = [.easy, .marathon, .threshold, .interval, .repetition]
            let points: [(pct: Double, pace: Double)] = zip(vo2maxPercents, vdotIntensities).map { pct, intensity in
                let pace = velocityToMinPerKm(v.trainingVelocity(intensity: intensity))
                return (pct, pace)
            }

            // Clamp to known range
            if targetPct <= points.first!.pct { return points.first!.pace }
            if targetPct >= points.last!.pct { return points.last!.pace }

            // Find the two surrounding points and interpolate
            for i in 0..<(points.count - 1) {
                let lo = points[i]
                let hi = points[i + 1]
                if targetPct >= lo.pct && targetPct <= hi.pct {
                    let t = (targetPct - lo.pct) / (hi.pct - lo.pct)
                    // Note: higher %VO2max → faster → lower min/km
                    return lo.pace + t * (hi.pace - lo.pace)
                }
            }

            // Fallback (shouldn't reach here)
            return velocityToMinPerKm(v.trainingVelocity(intensity: .easy))
        }
    }

    /// Map a WorkoutIntensity to the VDotCalculator's TrainingIntensity.
    private static func vdotIntensity(for intensity: WorkoutIntensity) -> Vdot.TrainingIntensity {
        switch intensity {
        case .easy: .easy
        case .marathon: .marathon
        case .tempo: .threshold
        case .interval: .interval
        case .repetition: .repetition
        }
    }

    /// Convert a VDotCalculator velocity measurement to min/km.
    private static func velocityToMinPerKm(_ velocity: Measurement<UnitSpeed>) -> Double {
        let metersPerSecond = velocity.converted(to: .metersPerSecond).value
        guard metersPerSecond > 0 else { return 0 }
        return (1000.0 / metersPerSecond) / 60.0
    }

    /// Format a pace in min/km as "M:SS".
    static func formatPace(_ minPerKm: Double) -> String {
        let totalSeconds = Int((minPerKm * 60).rounded())
        let minutes = totalSeconds / 60
        let seconds = totalSeconds % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}
