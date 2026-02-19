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
    func regenerateWeekDeletesExistingDataFirst() throws {
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

        let remainingWorkouts = try context.fetch(FetchDescriptor<PlannedWorkout>())
        let remainingSteps = try context.fetch(FetchDescriptor<PlannedWorkoutStep>())
        #expect(remainingWorkouts.isEmpty)
        #expect(remainingSteps.isEmpty)
        #expect(week.workoutsGenerated == false)

        manager.cancel()
    }
}
