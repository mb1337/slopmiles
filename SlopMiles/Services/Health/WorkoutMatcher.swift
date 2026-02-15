import Foundation
import HealthKit

struct WorkoutMatcher {
    struct Match {
        let workout: PlannedWorkout
        let hkWorkouts: [HKWorkout]
    }

    static func findMatches(
        plannedWorkouts: [PlannedWorkout],
        hkWorkouts: [HKWorkout]
    ) -> [Match] {
        let calendar = Calendar.current

        // Filter to eligible planned workouts: planned/scheduled, non-rest, not already linked
        let eligible = plannedWorkouts.filter { workout in
            (workout.completionStatus == .planned || workout.completionStatus == .scheduled)
            && workout.workoutType != .rest
            && !workout.isLinkedToHealthKit
        }

        guard !eligible.isEmpty, !hkWorkouts.isEmpty else { return [] }

        // Collect HK workout IDs already linked to any planned workout (including non-eligible ones)
        let alreadyLinkedIDs = Set(plannedWorkouts.flatMap { $0.linkedWorkouts.map(\.healthKitWorkoutID) })

        // Filter out HK workouts that are already linked
        let availableHK = hkWorkouts.filter { hk in
            !alreadyLinkedIDs.contains(hk.uuid.uuidString)
        }

        guard !availableHK.isEmpty else { return [] }

        // Group planned workouts by calendar day
        var plannedByDay: [DateComponents: [PlannedWorkout]] = [:]
        for workout in eligible {
            let day = calendar.dateComponents([.year, .month, .day], from: workout.scheduledDate)
            plannedByDay[day, default: []].append(workout)
        }

        // Group HK workouts by calendar day
        var hkByDay: [DateComponents: [HKWorkout]] = [:]
        for hk in availableHK {
            let day = calendar.dateComponents([.year, .month, .day], from: hk.startDate)
            hkByDay[day, default: []].append(hk)
        }

        var matches: [Match] = []

        for (day, dayPlanned) in plannedByDay {
            guard let dayHK = hkByDay[day], !dayHK.isEmpty else { continue }

            if dayPlanned.count == 1 {
                // One planned workout: all HK runs on that day link to it
                let planned = dayPlanned[0]
                let aggregateDistanceKm = dayHK.reduce(0.0) { sum, hk in
                    sum + (hk.totalDistance?.doubleValue(for: .meterUnit(with: .kilo)) ?? 0)
                }
                if planned.distanceKm <= 0 || aggregateDistanceKm >= planned.distanceKm * 0.5 {
                    matches.append(Match(workout: planned, hkWorkouts: dayHK))
                }
            } else {
                // Multiple planned workouts: assign each HK run to closest by distance
                var assignments: [UUID: [HKWorkout]] = [:]
                for planned in dayPlanned {
                    assignments[planned.id] = []
                }

                for hk in dayHK {
                    let hkDistanceKm = hk.totalDistance?.doubleValue(for: .meterUnit(with: .kilo)) ?? 0
                    let closest = dayPlanned.min { a, b in
                        abs(a.distanceKm - hkDistanceKm) < abs(b.distanceKm - hkDistanceKm)
                    }!
                    assignments[closest.id, default: []].append(hk)
                }

                for planned in dayPlanned {
                    let assigned = assignments[planned.id] ?? []
                    guard !assigned.isEmpty else { continue }

                    let aggregateDistanceKm = assigned.reduce(0.0) { sum, hk in
                        sum + (hk.totalDistance?.doubleValue(for: .meterUnit(with: .kilo)) ?? 0)
                    }
                    if planned.distanceKm <= 0 || aggregateDistanceKm >= planned.distanceKm * 0.5 {
                        matches.append(Match(workout: planned, hkWorkouts: assigned))
                    }
                }
            }
        }

        return matches
    }

    static func applyMatches(_ matches: [Match]) {
        for match in matches {
            let entries = match.hkWorkouts.map { hk in
                LinkedWorkoutEntry(
                    healthKitWorkoutID: hk.uuid.uuidString,
                    distanceKm: hk.totalDistance?.doubleValue(for: .meterUnit(with: .kilo)) ?? 0,
                    durationMinutes: hk.duration / 60.0
                )
            }
            match.workout.linkedWorkouts = entries
            match.workout.completionStatus = .completed
        }
    }

    /// Removes linked entries whose HK workout no longer exists in HealthKit.
    /// If all entries are removed, reverts the workout status to `.planned`.
    static func removeStaleLinks(
        plannedWorkouts: [PlannedWorkout],
        hkWorkouts: [HKWorkout]
    ) {
        let hkIDs = Set(hkWorkouts.map { $0.uuid.uuidString })

        for workout in plannedWorkouts where workout.isLinkedToHealthKit {
            let remaining = workout.linkedWorkouts.filter { hkIDs.contains($0.healthKitWorkoutID) }
            if remaining.count != workout.linkedWorkouts.count {
                workout.linkedWorkouts = remaining
                if remaining.isEmpty {
                    workout.completionStatus = .planned
                }
            }
        }
    }

    static func unlinkWorkout(_ workout: PlannedWorkout) {
        workout.linkedWorkoutsJSON = "[]"
        workout.completionStatus = .planned
    }

    static func unlinkSingleRun(_ healthKitWorkoutID: String, from workout: PlannedWorkout) {
        var entries = workout.linkedWorkouts
        entries.removeAll { $0.healthKitWorkoutID == healthKitWorkoutID }
        workout.linkedWorkouts = entries
        if entries.isEmpty {
            workout.completionStatus = .planned
        }
    }
}
