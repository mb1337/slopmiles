import Testing
import Foundation
import SwiftData
@testable import SlopMiles

@Suite("WeekGenerationManager Tests")
@MainActor
struct WeekGenerationManagerTests {
    private static func makeTestContext() throws -> ModelContext {
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        let container = try ModelContainer(
            for: TrainingPlan.self,
            TrainingWeek.self,
            PlannedWorkout.self,
            PlannedWorkoutStep.self,
            configurations: config
        )
        return ModelContext(container)
    }

    // MARK: - findCurrentWeek

    @Test("findCurrentWeek returns correct week based on plan start date")
    func findCurrentWeekBasic() {
        let manager = WeekGenerationManager()
        let calendar = Calendar.current
        let planStart = calendar.startOfDay(for: Date())

        let plan = TrainingPlan(name: "Test", goalDescription: "5K", startDate: planStart, endDate: calendar.date(byAdding: .weekOfYear, value: 8, to: planStart)!)
        let week1 = TrainingWeek(weekNumber: 1, theme: "Base")
        let week2 = TrainingWeek(weekNumber: 2, theme: "Build")
        week1.plan = plan
        week2.plan = plan

        let found = manager.findCurrentWeek(in: plan, now: planStart, firstDayOfWeek: calendar.firstWeekday)
        #expect(found?.weekNumber == 1)
    }

    @Test("findCurrentWeek returns nil when now is before plan start")
    func findCurrentWeekBeforePlan() {
        let manager = WeekGenerationManager()
        let calendar = Calendar.current
        let tomorrow = calendar.date(byAdding: .day, value: 1, to: Date())!

        let plan = TrainingPlan(name: "Test", goalDescription: "5K", startDate: tomorrow, endDate: calendar.date(byAdding: .weekOfYear, value: 4, to: tomorrow)!)
        let week1 = TrainingWeek(weekNumber: 1, theme: "Base")
        week1.plan = plan

        let found = manager.findCurrentWeek(in: plan, now: Date(), firstDayOfWeek: calendar.firstWeekday)
        #expect(found == nil)
    }

    @Test("No active plan does nothing")
    func noActivePlanDoesNothing() {
        let manager = WeekGenerationManager()
        if case .idle = manager.status {
            // expected
        } else {
            Issue.record("Expected initial status .idle")
        }
    }

    @Test("Cancel resets to idle")
    func cancelResetsToIdle() {
        let manager = WeekGenerationManager()
        manager.cancel()
        if case .idle = manager.status {
            // expected
        } else {
            Issue.record("Expected .idle after cancel")
        }
    }

    @Test("regenerateWeek deletes existing workouts and steps before regeneration task runs")
    func regenerateWeekDeletesExistingDataFirst() async throws {
        let context = try Self.makeTestContext()

        let plan = TrainingPlan(
            name: "Test Plan",
            goalDescription: "Goal",
            startDate: Date(),
            endDate: Calendar.current.date(byAdding: .weekOfYear, value: 8, to: Date())!
        )
        let week = TrainingWeek(weekNumber: 1, theme: "Base", workoutsGenerated: true)
        week.plan = plan

        let workout = PlannedWorkout(
            name: "Scheduled Workout",
            workoutType: .tempo,
            scheduledDate: Date(),
            distanceKm: 8
        )
        workout.completionStatus = .scheduled
        workout.watchScheduleID = "watch-id"
        workout.calendarEventID = "calendar-id"
        workout.week = week

        let step = PlannedWorkoutStep(order: 0, stepType: .work, name: "Main Set", goalType: .distance, goalValue: 4000)
        step.workout = workout

        context.insert(plan)
        context.insert(week)
        context.insert(workout)
        context.insert(step)

        let mockProvider = MockAIProvider()
        mockProvider.responses = [
            AIResponse(
                message: AIMessage(role: .assistant, content: ""),
                stopReason: .endTurn,
                usage: nil
            ),
        ]

        let coachingService = CoachingService(keychainService: KeychainService())
        coachingService.providerOverride = mockProvider

        let manager = WeekGenerationManager()
        manager.regenerateWeek(
            week: week,
            plan: plan,
            profile: UserProfile(),
            schedule: WeeklySchedule(),
            equipment: RunnerEquipment(),
            settings: AISettings(),
            coachingService: coachingService,
            context: context,
            healthKitService: HealthKitService(),
            workoutKitService: WorkoutKitService(),
            calendarService: CalendarService(),
            conversation: CoachingConversation()
        )

        let deadline = Date().addingTimeInterval(1.0)
        while Date() < deadline {
            let workouts = try context.fetch(FetchDescriptor<PlannedWorkout>())
            let steps = try context.fetch(FetchDescriptor<PlannedWorkoutStep>())
            if workouts.isEmpty && steps.isEmpty {
                break
            }
            await Task.yield()
        }

        let remainingWorkouts = try context.fetch(FetchDescriptor<PlannedWorkout>())
        let remainingSteps = try context.fetch(FetchDescriptor<PlannedWorkoutStep>())
        #expect(remainingWorkouts.isEmpty)
        #expect(remainingSteps.isEmpty)
        #expect(week.workoutsGenerated == false)

        manager.cancel()
    }
}

@Suite("CalendarService Tests")
@MainActor
struct CalendarServiceTests {
    private func makeCalendar() -> Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar
    }

    private func makeDate(
        year: Int = 2026,
        month: Int = 2,
        day: Int = 16,
        hour: Int,
        minute: Int,
        calendar: Calendar
    ) -> Date {
        let components = DateComponents(
            timeZone: calendar.timeZone,
            year: year,
            month: month,
            day: day,
            hour: hour,
            minute: minute
        )
        return calendar.date(from: components)!
    }

    @Test("resolvedStartDate uses schedule window when provided")
    func resolvedStartDateUsesScheduleWindow() {
        let calendar = makeCalendar()
        let workout = PlannedWorkout(
            name: "Tempo",
            workoutType: .tempo,
            scheduledDate: makeDate(hour: 9, minute: 30, calendar: calendar)
        )
        let schedule = WeeklySchedule()
        schedule.setTimeWindows(
            for: 2,
            windows: [WeeklySchedule.TimeWindow(startMinutes: 6 * 60 + 15, endMinutes: 7 * 60)]
        )

        let service = CalendarService()
        let resolved = service.resolvedStartDate(
            for: workout,
            schedule: schedule,
            existingEventStartDate: nil,
            calendar: calendar
        )
        let components = calendar.dateComponents([.hour, .minute], from: resolved)
        #expect(components.hour == 6)
        #expect(components.minute == 15)
    }

    @Test("resolvedStartDate preserves workout time when schedule is missing")
    func resolvedStartDatePreservesWorkoutTimeWithoutSchedule() {
        let calendar = makeCalendar()
        let workout = PlannedWorkout(
            name: "Easy",
            workoutType: .easy,
            scheduledDate: makeDate(hour: 17, minute: 45, calendar: calendar)
        )

        let service = CalendarService()
        let resolved = service.resolvedStartDate(
            for: workout,
            schedule: nil,
            existingEventStartDate: nil,
            calendar: calendar
        )
        let components = calendar.dateComponents([.hour, .minute], from: resolved)
        #expect(components.hour == 17)
        #expect(components.minute == 45)
    }

    @Test("resolvedStartDate preserves existing event time when workout time is unset")
    func resolvedStartDateUsesExistingEventTimeWhenWorkoutTimeUnset() {
        let calendar = makeCalendar()
        let workout = PlannedWorkout(
            name: "Long Run",
            workoutType: .long,
            scheduledDate: makeDate(hour: 0, minute: 0, calendar: calendar)
        )
        let existingStart = makeDate(year: 2026, month: 2, day: 14, hour: 18, minute: 20, calendar: calendar)

        let service = CalendarService()
        let resolved = service.resolvedStartDate(
            for: workout,
            schedule: nil,
            existingEventStartDate: existingStart,
            calendar: calendar
        )
        let components = calendar.dateComponents([.hour, .minute], from: resolved)
        #expect(components.hour == 18)
        #expect(components.minute == 20)
    }

    @Test("resolvedStartDate defaults to 7:00 AM only when no time is available")
    func resolvedStartDateFallsBackToSevenAM() {
        let calendar = makeCalendar()
        let workout = PlannedWorkout(
            name: "Recovery",
            workoutType: .recovery,
            scheduledDate: makeDate(hour: 0, minute: 0, calendar: calendar)
        )

        let service = CalendarService()
        let resolved = service.resolvedStartDate(
            for: workout,
            schedule: nil,
            existingEventStartDate: nil,
            calendar: calendar
        )
        let components = calendar.dateComponents([.hour, .minute], from: resolved)
        #expect(components.hour == 7)
        #expect(components.minute == 0)
    }
}
