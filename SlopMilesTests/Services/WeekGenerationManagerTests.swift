import Testing
import Foundation
@testable import SlopMiles

@Suite("WeekGenerationManager Tests")
@MainActor
struct WeekGenerationManagerTests {
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
}
