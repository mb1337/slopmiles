import Testing
import Foundation
@testable import SlopMiles

@Suite("Training Plan Model Tests")
struct TrainingPlanTests {
    @Test("Plan initializes with defaults")
    func defaultInit() {
        let plan = TrainingPlan()
        #expect(plan.name == "")
        #expect(plan.difficulty == .intermediate)
        #expect(plan.totalWeeks == 0)
    }

    @Test("Plan custom init")
    func customInit() {
        let plan = TrainingPlan(
            name: "Half Marathon Plan", goalDescription: "Sub 1:45 half",
            raceDistance: 21097.5, difficulty: .advanced,
            startDate: Date(), endDate: Date(), weeklyMileageTargetKm: 50
        )
        #expect(plan.name == "Half Marathon Plan")
        #expect(plan.raceDistance == 21097.5)
        #expect(plan.difficulty == .advanced)
    }

    @Test("Workout type properties")
    func workoutTypeProperties() {
        #expect(WorkoutType.easy.displayName == "Easy Run")
        #expect(WorkoutType.interval.displayName == "Intervals")
        #expect(WorkoutType.long.iconName == "road.lanes")
    }

    @Test("Workout completion status")
    func workoutCompletionStatus() {
        let workout = PlannedWorkout()
        #expect(workout.completionStatus == .planned)
        workout.completionStatus = .scheduled
        #expect(workout.completionStatusRaw == "scheduled")
    }

    @Test("Step type round-trip")
    func stepTypeRoundTrip() {
        let step = PlannedWorkoutStep(order: 0, stepType: .warmup, goalType: .time, goalValue: 600)
        #expect(step.stepType == .warmup)
        #expect(step.stepTypeRaw == "warmup")
    }

    @Test("Weekly schedule time windows")
    func weeklyScheduleTimeWindows() {
        let schedule = WeeklySchedule()
        let monday = schedule.timeWindow(for: 2)
        #expect(monday != nil)
        #expect(monday?.durationMinutes == 60)
        let sunday = schedule.timeWindow(for: 1)
        #expect(sunday == nil)
    }

    @Test("Weekly schedule available days")
    func weeklyScheduleAvailableDays() {
        let schedule = WeeklySchedule()
        #expect(schedule.availableDays.count == 6)
        #expect(schedule.restDays.count == 1)
    }

    @Test("Runner equipment dictionary for prompt")
    func equipmentDictionary() {
        let equipment = RunnerEquipment()
        equipment.hasTreadmill = true
        equipment.hasTrackAccess = true
        let dict = equipment.dictionaryForPrompt()
        #expect(dict["treadmill_available"]?.boolValue == true)
        #expect(dict["track_available"]?.boolValue == true)
        #expect(dict["trail_available"]?.boolValue == false)
    }

    @Test("Running stats dictionary for prompt")
    func runningStatsDictionary() {
        var stats = RunningStats()
        stats.averageWeeklyDistanceKm = 45.3
        stats.averagePaceMinPerKm = 5.5
        stats.totalRunsLast30Days = 12
        let dict = stats.dictionaryForPrompt()
        #expect(dict["total_runs_last_30_days"]?.intValue == 12)
        #expect(dict["average_weekly_distance_km"]?.doubleValue == 45.3)
    }
}
