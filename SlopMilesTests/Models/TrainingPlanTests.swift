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
        #expect(plan.isActive == false)
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

    @Test("Weekly schedule multiple time slots")
    func weeklyScheduleMultipleSlots() {
        let schedule = WeeklySchedule()
        // Set two slots for Monday (day 2)
        schedule.setTimeWindows(for: 2, windows: [
            WeeklySchedule.TimeWindow(startMinutes: 360, endMinutes: 420),
            WeeklySchedule.TimeWindow(startMinutes: 1080, endMinutes: 1200)
        ])
        let windows = schedule.timeWindows(for: 2)
        #expect(windows.count == 2)
        #expect(windows[0].startMinutes == 360)
        #expect(windows[0].endMinutes == 420)
        #expect(windows[1].startMinutes == 1080)
        #expect(windows[1].endMinutes == 1200)
        #expect(schedule.totalDuration(for: 2) == 180)

        // timeWindow(for:) should return the longest slot
        let single = schedule.timeWindow(for: 2)
        #expect(single?.durationMinutes == 120)
    }

    @Test("Weekly schedule available days")
    func weeklyScheduleAvailableDays() {
        let schedule = WeeklySchedule()
        #expect(schedule.availableDays.count == 6)
        #expect(schedule.restDays.count == 1)
    }

    @Test("Weekly schedule dictionaryForPrompt with multiple slots")
    func weeklyScheduleDictionaryForPromptMultiSlots() {
        let schedule = WeeklySchedule()
        schedule.setTimeWindows(for: 2, windows: [
            WeeklySchedule.TimeWindow(startMinutes: 360, endMinutes: 420),
            WeeklySchedule.TimeWindow(startMinutes: 1080, endMinutes: 1200)
        ])
        let prompt = schedule.dictionaryForPrompt()

        // Monday is index 1 (Sunday=0, Monday=1)
        guard case .object(let mondayDict) = prompt[1] else {
            Issue.record("Expected object for Monday"); return
        }
        #expect(mondayDict["available"]?.boolValue == true)
        #expect(mondayDict["total_duration_minutes"]?.intValue == 180)
        guard case .array(let slots) = mondayDict["time_slots"] else {
            Issue.record("Expected time_slots array"); return
        }
        #expect(slots.count == 2)

        // Sunday should be unavailable
        guard case .object(let sundayDict) = prompt[0] else {
            Issue.record("Expected object for Sunday"); return
        }
        #expect(sundayDict["available"]?.boolValue == false)
    }

    @Test("Weekly schedule migration from legacy single-slot format")
    func weeklyScheduleMigration() {
        let schedule = WeeklySchedule()
        // Simulate a legacy record: slotsJSON is empty, but legacy properties have data
        schedule.slotsJSON = "{}"
        // Legacy properties are already set from init(), so migrateIfNeeded should populate slotsJSON
        schedule.migrateIfNeeded()

        let monday = schedule.timeWindows(for: 2)
        #expect(monday.count == 1)
        #expect(monday[0].durationMinutes == 60)

        let saturday = schedule.timeWindows(for: 7)
        #expect(saturday.count == 1)
        #expect(saturday[0].durationMinutes == 180)

        let sunday = schedule.timeWindows(for: 1)
        #expect(sunday.isEmpty)
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

    @Test("shiftStartDate shifts plan and workout dates by correct delta")
    func shiftStartDate() {
        let calendar = Calendar.current
        let start = calendar.date(from: DateComponents(year: 2026, month: 3, day: 2))!
        let end = calendar.date(from: DateComponents(year: 2026, month: 5, day: 25))!

        let plan = TrainingPlan(name: "Test", goalDescription: "Test", startDate: start, endDate: end)

        let workout1Date = calendar.date(from: DateComponents(year: 2026, month: 3, day: 3))!
        let workout2Date = calendar.date(from: DateComponents(year: 2026, month: 3, day: 5))!
        let w1 = PlannedWorkout(name: "Easy", workoutType: .easy, scheduledDate: workout1Date)
        let w2 = PlannedWorkout(name: "Tempo", workoutType: .tempo, scheduledDate: workout2Date)

        let week = TrainingWeek(weekNumber: 1)
        week.workouts = [w1, w2]
        plan.weeks = [week]

        let newStart = calendar.date(from: DateComponents(year: 2026, month: 3, day: 9))!
        plan.shiftStartDate(to: newStart)

        // 7 days later
        #expect(calendar.component(.day, from: plan.startDate) == 9)
        #expect(calendar.component(.day, from: plan.endDate) == 1) // May 25 + 7 = Jun 1
        #expect(calendar.component(.month, from: plan.endDate) == 6)
        #expect(calendar.component(.day, from: w1.scheduledDate) == 10)
        #expect(calendar.component(.day, from: w2.scheduledDate) == 12)
    }

    @Test("Reordering workouts swaps their scheduled dates")
    func reorderWorkoutsSwapsDates() {
        let calendar = Calendar.current
        let mon = calendar.date(from: DateComponents(year: 2026, month: 3, day: 2))!
        let wed = calendar.date(from: DateComponents(year: 2026, month: 3, day: 4))!
        let fri = calendar.date(from: DateComponents(year: 2026, month: 3, day: 6))!

        let w1 = PlannedWorkout(name: "Easy", workoutType: .easy, scheduledDate: mon)
        let w2 = PlannedWorkout(name: "Tempo", workoutType: .tempo, scheduledDate: wed)
        let w3 = PlannedWorkout(name: "Long", workoutType: .long, scheduledDate: fri)

        let week = TrainingWeek(weekNumber: 1)
        week.workouts = [w1, w2, w3]

        // Simulate moving the last workout (Long, index 2) to the top (index 0)
        var workouts = week.sortedWorkouts
        let originalDates = workouts.map(\.scheduledDate)
        workouts.move(fromOffsets: IndexSet(integer: 2), toOffset: 0)
        for (index, workout) in workouts.enumerated() {
            workout.scheduledDate = originalDates[index]
        }

        // After move: Long (Mon), Easy (Wed), Tempo (Fri)
        let sorted = week.sortedWorkouts
        #expect(sorted[0].name == "Long")
        #expect(sorted[1].name == "Easy")
        #expect(sorted[2].name == "Tempo")
        #expect(calendar.component(.day, from: sorted[0].scheduledDate) == 2)
        #expect(calendar.component(.day, from: sorted[1].scheduledDate) == 4)
        #expect(calendar.component(.day, from: sorted[2].scheduledDate) == 6)
    }

    @Test("shiftStartDate does not change raceDate")
    func shiftStartDatePreservesRaceDate() {
        let calendar = Calendar.current
        let start = calendar.date(from: DateComponents(year: 2026, month: 3, day: 2))!
        let end = calendar.date(from: DateComponents(year: 2026, month: 5, day: 25))!
        let race = calendar.date(from: DateComponents(year: 2026, month: 5, day: 30))!

        let plan = TrainingPlan(name: "Race Plan", goalDescription: "Marathon", raceDate: race, startDate: start, endDate: end)
        plan.weeks = []

        let newStart = calendar.date(from: DateComponents(year: 2026, month: 3, day: 9))!
        plan.shiftStartDate(to: newStart)

        #expect(plan.raceDate == race)
    }
}
