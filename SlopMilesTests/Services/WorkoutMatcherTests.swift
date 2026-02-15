import Testing
import Foundation
import HealthKit
@testable import SlopMiles

@Suite("WorkoutMatcher Tests")
struct WorkoutMatcherTests {
    private let calendar = Calendar.current

    private func makeDate(year: Int = 2026, month: Int = 2, day: Int, hour: Int = 8) -> Date {
        calendar.date(from: DateComponents(year: year, month: month, day: day, hour: hour))!
    }

    private func makeHKWorkout(date: Date, distanceKm: Double, durationMinutes: Double) -> HKWorkout {
        let distance = HKQuantity(unit: .meterUnit(with: .kilo), doubleValue: distanceKm)
        return HKWorkout(
            activityType: .running,
            start: date,
            end: date.addingTimeInterval(durationMinutes * 60),
            duration: durationMinutes * 60,
            totalEnergyBurned: nil,
            totalDistance: distance,
            metadata: nil
        )
    }

    // MARK: - No matches

    @Test("No matches when no HK workouts")
    func noMatchesWithoutHKWorkouts() {
        let planned = PlannedWorkout(
            name: "Easy Run", workoutType: .easy,
            scheduledDate: makeDate(day: 10), distanceKm: 8
        )
        let matches = WorkoutMatcher.findMatches(plannedWorkouts: [planned], hkWorkouts: [])
        #expect(matches.isEmpty)
    }

    @Test("No matches for rest days")
    func noMatchesForRestDays() {
        let rest = PlannedWorkout(
            name: "Rest", workoutType: .rest,
            scheduledDate: makeDate(day: 10)
        )
        let hk = makeHKWorkout(date: makeDate(day: 10), distanceKm: 5, durationMinutes: 30)
        let matches = WorkoutMatcher.findMatches(plannedWorkouts: [rest], hkWorkouts: [hk])
        #expect(matches.isEmpty)
    }

    @Test("No matches for already completed workouts")
    func noMatchesForCompletedWorkouts() {
        let planned = PlannedWorkout(
            name: "Easy Run", workoutType: .easy,
            scheduledDate: makeDate(day: 10), distanceKm: 8
        )
        planned.completionStatus = .completed
        let hk = makeHKWorkout(date: makeDate(day: 10), distanceKm: 8, durationMinutes: 48)
        let matches = WorkoutMatcher.findMatches(plannedWorkouts: [planned], hkWorkouts: [hk])
        #expect(matches.isEmpty)
    }

    @Test("No matches for already linked workouts")
    func noMatchesForAlreadyLinked() {
        let planned = PlannedWorkout(
            name: "Easy Run", workoutType: .easy,
            scheduledDate: makeDate(day: 10), distanceKm: 8
        )
        planned.linkedWorkouts = [LinkedWorkoutEntry(healthKitWorkoutID: "abc", distanceKm: 8, durationMinutes: 48)]
        let hk = makeHKWorkout(date: makeDate(day: 10), distanceKm: 8, durationMinutes: 48)
        let matches = WorkoutMatcher.findMatches(plannedWorkouts: [planned], hkWorkouts: [hk])
        #expect(matches.isEmpty)
    }

    // MARK: - Single run matching

    @Test("Single run links to single planned workout on same day")
    func singleRunMatchesSinglePlanned() {
        let planned = PlannedWorkout(
            name: "Easy Run", workoutType: .easy,
            scheduledDate: makeDate(day: 10), distanceKm: 8
        )
        let hk = makeHKWorkout(date: makeDate(day: 10, hour: 7), distanceKm: 7.5, durationMinutes: 45)
        let matches = WorkoutMatcher.findMatches(plannedWorkouts: [planned], hkWorkouts: [hk])
        #expect(matches.count == 1)
        #expect(matches[0].hkWorkouts.count == 1)
    }

    @Test("No match when run is on a different day")
    func noMatchDifferentDay() {
        let planned = PlannedWorkout(
            name: "Easy Run", workoutType: .easy,
            scheduledDate: makeDate(day: 10), distanceKm: 8
        )
        let hk = makeHKWorkout(date: makeDate(day: 11), distanceKm: 8, durationMinutes: 48)
        let matches = WorkoutMatcher.findMatches(plannedWorkouts: [planned], hkWorkouts: [hk])
        #expect(matches.isEmpty)
    }

    // MARK: - Multiple runs per workout

    @Test("Multiple runs on same day link to single planned workout")
    func multipleRunsLinkToSinglePlanned() {
        let planned = PlannedWorkout(
            name: "Long Run", workoutType: .long,
            scheduledDate: makeDate(day: 10), distanceKm: 20
        )
        let hk1 = makeHKWorkout(date: makeDate(day: 10, hour: 7), distanceKm: 12, durationMinutes: 72)
        let hk2 = makeHKWorkout(date: makeDate(day: 10, hour: 9), distanceKm: 8, durationMinutes: 48)
        let matches = WorkoutMatcher.findMatches(plannedWorkouts: [planned], hkWorkouts: [hk1, hk2])
        #expect(matches.count == 1)
        #expect(matches[0].hkWorkouts.count == 2)
    }

    // MARK: - Multiple planned workouts on same day

    @Test("Two planned workouts on same day: runs assigned by closest distance")
    func twoPlannedAssignByDistance() {
        let easy = PlannedWorkout(
            name: "Easy Run", workoutType: .easy,
            scheduledDate: makeDate(day: 10), distanceKm: 5
        )
        let tempo = PlannedWorkout(
            name: "Tempo Run", workoutType: .tempo,
            scheduledDate: makeDate(day: 10), distanceKm: 12
        )
        let hkShort = makeHKWorkout(date: makeDate(day: 10, hour: 6), distanceKm: 4.5, durationMinutes: 27)
        let hkLong = makeHKWorkout(date: makeDate(day: 10, hour: 8), distanceKm: 11.5, durationMinutes: 55)

        let matches = WorkoutMatcher.findMatches(
            plannedWorkouts: [easy, tempo], hkWorkouts: [hkShort, hkLong]
        )
        #expect(matches.count == 2)

        let easyMatch = matches.first { $0.workout === easy }
        let tempoMatch = matches.first { $0.workout === tempo }
        #expect(easyMatch?.hkWorkouts.count == 1)
        #expect(tempoMatch?.hkWorkouts.count == 1)
    }

    // MARK: - Distance threshold

    @Test("Aggregate distance below 50% of planned is rejected")
    func distanceThresholdFiltering() {
        let planned = PlannedWorkout(
            name: "Long Run", workoutType: .long,
            scheduledDate: makeDate(day: 10), distanceKm: 20
        )
        // 9km is < 50% of 20km
        let hk = makeHKWorkout(date: makeDate(day: 10), distanceKm: 9, durationMinutes: 54)
        let matches = WorkoutMatcher.findMatches(plannedWorkouts: [planned], hkWorkouts: [hk])
        #expect(matches.isEmpty)
    }

    @Test("Aggregate distance at exactly 50% passes threshold")
    func distanceThresholdExactly50Percent() {
        let planned = PlannedWorkout(
            name: "Long Run", workoutType: .long,
            scheduledDate: makeDate(day: 10), distanceKm: 20
        )
        let hk = makeHKWorkout(date: makeDate(day: 10), distanceKm: 10, durationMinutes: 60)
        let matches = WorkoutMatcher.findMatches(plannedWorkouts: [planned], hkWorkouts: [hk])
        #expect(matches.count == 1)
    }

    @Test("Zero planned distance always matches")
    func zeroPlannedDistanceAlwaysMatches() {
        let planned = PlannedWorkout(
            name: "Easy Run", workoutType: .easy,
            scheduledDate: makeDate(day: 10), distanceKm: 0
        )
        let hk = makeHKWorkout(date: makeDate(day: 10), distanceKm: 3, durationMinutes: 20)
        let matches = WorkoutMatcher.findMatches(plannedWorkouts: [planned], hkWorkouts: [hk])
        #expect(matches.count == 1)
    }

    // MARK: - Apply matches

    @Test("Apply matches sets linked workouts and completion status")
    func applyMatchesSetsFields() {
        let planned = PlannedWorkout(
            name: "Easy Run", workoutType: .easy,
            scheduledDate: makeDate(day: 10), distanceKm: 8
        )
        let hk = makeHKWorkout(date: makeDate(day: 10), distanceKm: 7.8, durationMinutes: 47)
        let match = WorkoutMatcher.Match(workout: planned, hkWorkouts: [hk])

        WorkoutMatcher.applyMatches([match])

        #expect(planned.isLinkedToHealthKit)
        #expect(planned.completionStatus == .completed)
        #expect(planned.linkedWorkouts.count == 1)
        #expect(abs(planned.actualDistanceKm - 7.8) < 0.01)
        #expect(abs(planned.actualDurationMinutes - 47) < 0.1)
    }

    // MARK: - Unlink

    @Test("Unlink all clears fields and reverts status")
    func unlinkAllClearsAndReverts() {
        let planned = PlannedWorkout(
            name: "Easy Run", workoutType: .easy,
            scheduledDate: makeDate(day: 10), distanceKm: 8
        )
        planned.linkedWorkouts = [
            LinkedWorkoutEntry(healthKitWorkoutID: "a", distanceKm: 4, durationMinutes: 24),
            LinkedWorkoutEntry(healthKitWorkoutID: "b", distanceKm: 4, durationMinutes: 24),
        ]
        planned.completionStatus = .completed

        WorkoutMatcher.unlinkWorkout(planned)

        #expect(!planned.isLinkedToHealthKit)
        #expect(planned.completionStatus == .planned)
        #expect(planned.linkedWorkouts.isEmpty)
    }

    @Test("Unlink single run removes entry; empty array reverts status")
    func unlinkSingleRunRecalculates() {
        let planned = PlannedWorkout(
            name: "Easy Run", workoutType: .easy,
            scheduledDate: makeDate(day: 10), distanceKm: 8
        )
        planned.linkedWorkouts = [
            LinkedWorkoutEntry(healthKitWorkoutID: "a", distanceKm: 4, durationMinutes: 24),
            LinkedWorkoutEntry(healthKitWorkoutID: "b", distanceKm: 4, durationMinutes: 24),
        ]
        planned.completionStatus = .completed

        WorkoutMatcher.unlinkSingleRun("a", from: planned)

        #expect(planned.linkedWorkouts.count == 1)
        #expect(planned.completionStatus == .completed)
        #expect(abs(planned.actualDistanceKm - 4.0) < 0.01)

        WorkoutMatcher.unlinkSingleRun("b", from: planned)

        #expect(planned.linkedWorkouts.isEmpty)
        #expect(planned.completionStatus == .planned)
    }

    // MARK: - Skips already-linked HK workouts

    @Test("HK workouts already linked to another planned workout are not reused")
    func skipsAlreadyLinkedHKWorkouts() {
        let planned1 = PlannedWorkout(
            name: "Easy Run", workoutType: .easy,
            scheduledDate: makeDate(day: 10), distanceKm: 5
        )
        let hk = makeHKWorkout(date: makeDate(day: 10), distanceKm: 5, durationMinutes: 30)
        planned1.linkedWorkouts = [
            LinkedWorkoutEntry(healthKitWorkoutID: hk.uuid.uuidString, distanceKm: 5, durationMinutes: 30)
        ]
        planned1.completionStatus = .completed

        let planned2 = PlannedWorkout(
            name: "Tempo Run", workoutType: .tempo,
            scheduledDate: makeDate(day: 10), distanceKm: 8
        )

        let matches = WorkoutMatcher.findMatches(
            plannedWorkouts: [planned1, planned2], hkWorkouts: [hk]
        )
        #expect(matches.isEmpty)
    }

    // MARK: - Stale link removal

    @Test("Deleted HK workout is unlinked automatically")
    func removesStaleLink() {
        let planned = PlannedWorkout(
            name: "Easy Run", workoutType: .easy,
            scheduledDate: makeDate(day: 10), distanceKm: 8
        )
        planned.linkedWorkouts = [
            LinkedWorkoutEntry(healthKitWorkoutID: "deleted-id", distanceKm: 8, durationMinutes: 48)
        ]
        planned.completionStatus = .completed

        // No HK workouts returned — the linked one was deleted
        WorkoutMatcher.removeStaleLinks(plannedWorkouts: [planned], hkWorkouts: [])

        #expect(planned.linkedWorkouts.isEmpty)
        #expect(planned.completionStatus == .planned)
    }

    @Test("Only the deleted HK workout is removed, others kept")
    func removesOnlyDeletedStaleLink() {
        let hkKept = makeHKWorkout(date: makeDate(day: 10, hour: 7), distanceKm: 5, durationMinutes: 30)
        let planned = PlannedWorkout(
            name: "Long Run", workoutType: .long,
            scheduledDate: makeDate(day: 10), distanceKm: 10
        )
        planned.linkedWorkouts = [
            LinkedWorkoutEntry(healthKitWorkoutID: hkKept.uuid.uuidString, distanceKm: 5, durationMinutes: 30),
            LinkedWorkoutEntry(healthKitWorkoutID: "deleted-id", distanceKm: 5, durationMinutes: 30),
        ]
        planned.completionStatus = .completed

        WorkoutMatcher.removeStaleLinks(plannedWorkouts: [planned], hkWorkouts: [hkKept])

        #expect(planned.linkedWorkouts.count == 1)
        #expect(planned.linkedWorkouts[0].healthKitWorkoutID == hkKept.uuid.uuidString)
        #expect(planned.completionStatus == .completed)
    }

    @Test("No changes when all linked HK workouts still exist")
    func noChangesWhenAllLinksValid() {
        let hk = makeHKWorkout(date: makeDate(day: 10), distanceKm: 8, durationMinutes: 48)
        let planned = PlannedWorkout(
            name: "Easy Run", workoutType: .easy,
            scheduledDate: makeDate(day: 10), distanceKm: 8
        )
        planned.linkedWorkouts = [
            LinkedWorkoutEntry(healthKitWorkoutID: hk.uuid.uuidString, distanceKm: 8, durationMinutes: 48)
        ]
        planned.completionStatus = .completed

        WorkoutMatcher.removeStaleLinks(plannedWorkouts: [planned], hkWorkouts: [hk])

        #expect(planned.linkedWorkouts.count == 1)
        #expect(planned.completionStatus == .completed)
    }

    // MARK: - Scheduled status is eligible

    @Test("Scheduled workouts are eligible for matching")
    func scheduledWorkoutsAreEligible() {
        let planned = PlannedWorkout(
            name: "Easy Run", workoutType: .easy,
            scheduledDate: makeDate(day: 10), distanceKm: 8
        )
        planned.completionStatus = .scheduled
        let hk = makeHKWorkout(date: makeDate(day: 10), distanceKm: 8, durationMinutes: 48)
        let matches = WorkoutMatcher.findMatches(plannedWorkouts: [planned], hkWorkouts: [hk])
        #expect(matches.count == 1)
    }
}
