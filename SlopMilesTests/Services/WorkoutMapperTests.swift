import Testing
import Foundation
import WorkoutKit
@testable import SlopMiles

@Suite("Workout Mapper Tests")
struct WorkoutMapperTests {
    @Test("Maps simple easy run")
    func mapsEasyRun() {
        let workout = PlannedWorkout(
            name: "Easy Run", workoutType: .easy, scheduledDate: Date(),
            distanceKm: 8, durationMinutes: 48, targetPaceMinPerKm: 6.0
        )
        let plan = WorkoutMapper.mapToWorkoutPlan(workout)
        if case .goal(let single) = plan.workout {
            #expect(single.goal == .distance(8000, .meters))
        } else {
            Issue.record("Expected goal plan for simple easy run")
        }
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

    @Test("isSingleSegment returns true for stepless easy run")
    func singleSegmentSteplessEasyRun() {
        let workout = PlannedWorkout(
            name: "Easy Run", workoutType: .easy, scheduledDate: Date(),
            distanceKm: 5, durationMinutes: 30
        )
        #expect(WorkoutMapper.isSingleSegment(workout))
    }

    @Test("isSingleSegment returns true for single work step")
    func singleSegmentOneWorkStep() {
        let workout = PlannedWorkout(name: "Tempo", workoutType: .tempo, scheduledDate: Date())
        let work = PlannedWorkoutStep(order: 0, stepType: .work, name: "Tempo", goalType: .distance, goalValue: 5000)
        work.workout = workout
        #expect(WorkoutMapper.isSingleSegment(workout))
    }

    @Test("isSingleSegment returns false for interval workout with warmup/cooldown")
    func notSingleSegmentIntervals() {
        let workout = PlannedWorkout(name: "Intervals", workoutType: .interval, scheduledDate: Date())
        let warmup = PlannedWorkoutStep(order: 0, stepType: .warmup, name: "Warmup", goalType: .time, goalValue: 600)
        warmup.workout = workout
        let work = PlannedWorkoutStep(order: 1, stepType: .work, name: "800m", goalType: .distance, goalValue: 800, repeatCount: 4)
        work.workout = workout
        let recovery = PlannedWorkoutStep(order: 2, stepType: .recovery, name: "Jog", goalType: .time, goalValue: 120)
        recovery.workout = workout
        let cooldown = PlannedWorkoutStep(order: 3, stepType: .cooldown, name: "Cooldown", goalType: .time, goalValue: 600)
        cooldown.workout = workout
        #expect(!WorkoutMapper.isSingleSegment(workout))
    }

    @Test("mapToWorkoutPlan returns goal plan for simple easy run")
    func goalPlanForEasyRun() {
        let workout = PlannedWorkout(
            name: "Recovery", workoutType: .recovery, scheduledDate: Date(),
            distanceKm: 5, durationMinutes: 35
        )
        let plan = WorkoutMapper.mapToWorkoutPlan(workout)
        if case .goal = plan.workout {
            // Expected goal plan
        } else {
            Issue.record("Expected goal plan for simple recovery run")
        }
    }

    @Test("mapToWorkoutPlan returns custom plan for interval workout")
    func customPlanForIntervalWorkout() {
        let workout = PlannedWorkout(name: "Intervals", workoutType: .interval, scheduledDate: Date())
        let warmup = PlannedWorkoutStep(order: 0, stepType: .warmup, name: "Warmup", goalType: .time, goalValue: 600)
        warmup.workout = workout
        let work = PlannedWorkoutStep(order: 1, stepType: .work, name: "400m", goalType: .distance, goalValue: 400, repeatCount: 8)
        work.workout = workout
        let recovery = PlannedWorkoutStep(order: 2, stepType: .recovery, name: "Jog", goalType: .time, goalValue: 90)
        recovery.workout = workout
        let cooldown = PlannedWorkoutStep(order: 3, stepType: .cooldown, name: "Cooldown", goalType: .time, goalValue: 600)
        cooldown.workout = workout

        let plan = WorkoutMapper.mapToWorkoutPlan(workout)
        if case .custom = plan.workout {
            // Expected custom plan
        } else {
            Issue.record("Expected custom plan for interval workout")
        }
    }
}
