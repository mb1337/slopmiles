import Testing
import Foundation
@testable import SlopMiles

@Suite("Workout Mapper Tests")
struct WorkoutMapperTests {
    @Test("Maps simple easy run")
    func mapsEasyRun() {
        let workout = PlannedWorkout(
            name: "Easy Run", workoutType: .easy, scheduledDate: Date(),
            distanceKm: 8, durationMinutes: 48, targetPaceMinPerKm: 6.0
        )
        let custom = WorkoutMapper.mapToCustomWorkout(workout)
        #expect(custom.displayName == "Easy Run")
    }

    @Test("Maps interval workout with steps")
    func mapsIntervalWorkout() {
        let workout = PlannedWorkout(name: "800m Repeats", workoutType: .interval, scheduledDate: Date())
        let warmup = PlannedWorkoutStep(order: 0, stepType: .warmup, name: "Warmup", goalType: .time, goalValue: 600)
        warmup.workout = workout
        let work = PlannedWorkoutStep(order: 1, stepType: .work, name: "800m", goalType: .distance, goalValue: 800, targetPaceMinPerKm: 3.8, repeatCount: 6)
        work.workout = workout
        let recovery = PlannedWorkoutStep(order: 2, stepType: .recovery, name: "400m jog", goalType: .distance, goalValue: 400)
        recovery.workout = workout
        let cooldown = PlannedWorkoutStep(order: 3, stepType: .cooldown, name: "Cooldown", goalType: .time, goalValue: 600)
        cooldown.workout = workout

        let custom = WorkoutMapper.mapToCustomWorkout(workout)
        #expect(custom.displayName == "800m Repeats")
    }
}
