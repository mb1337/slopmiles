import Testing
import Foundation
import SwiftData
@testable import SlopMiles

@Suite("Response Parser Tests")
struct ResponseParserTests {

    /// Creates an in-memory ModelContainer suitable for testing parsePlan.
    private static func makeTestContext() throws -> ModelContext {
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        let container = try ModelContainer(
            for: TrainingPlan.self, TrainingWeek.self, PlannedWorkout.self, PlannedWorkoutStep.self,
            configurations: config
        )
        return ModelContext(container)
    }

    // MARK: - extractJSON tests

    @Test("Extract JSON from plain text")
    func extractJSONPlain() throws {
        let text = """
        {"name": "Test Plan", "weeks": []}
        """
        let json = try ResponseParser.extractJSON(from: text)
        let dict = json as! [String: Any]
        #expect(dict["name"] as! String == "Test Plan")
    }

    @Test("Extract JSON from markdown code block")
    func extractJSONFromCodeBlock() throws {
        let text = """
        Here is the plan:
        ```json
        {"name": "Test Plan", "weeks": []}
        ```
        """
        let json = try ResponseParser.extractJSON(from: text)
        let dict = json as! [String: Any]
        #expect(dict["name"] as! String == "Test Plan")
    }

    @Test("Extract JSON with surrounding text")
    func extractJSONWithSurroundingText() throws {
        let text = """
        Based on your profile, here is your plan:
        {"name": "Marathon Plan", "weeks": [{"week_number": 1, "theme": "Base", "total_distance_km": 30, "notes": "", "workouts": []}]}
        Hope this helps!
        """
        let json = try ResponseParser.extractJSON(from: text)
        let dict = json as! [String: Any]
        #expect(dict["name"] as! String == "Marathon Plan")
    }

    @Test("Throws on no JSON")
    func throwsOnNoJSON() {
        #expect(throws: ResponseParser.ParseError.self) {
            try ResponseParser.extractJSON(from: "No JSON here at all")
        }
    }

    // MARK: - parseWorkout / parseStep unit tests

    @Test("Parse workout from dictionary")
    func parseWorkout() {
        let dict: [String: Any] = [
            "name": "Easy Run", "type": "easy", "day_of_week": 2,
            "distance_km": 8.0, "duration_minutes": 48.0,
            "target_pace_min_per_km": 6.0, "location": "outdoor", "notes": "Keep it easy",
        ]
        let workout = ResponseParser.parseWorkout(from: dict, weekNumber: 1, planStartDate: Date(), calendar: Calendar.current)
        #expect(workout.name == "Easy Run")
        #expect(workout.workoutType == .easy)
        #expect(workout.distanceKm == 8.0)
        #expect(workout.targetPaceMinPerKm == 6.0)
        #expect(workout.location == .outdoor)
    }

    @Test("Parse step from dictionary")
    func parseStep() {
        let dict: [String: Any] = [
            "type": "work", "name": "800m repeat", "goal_type": "distance",
            "goal_value": 800.0, "target_pace_min_per_km": 4.2, "hr_zone": 4, "repeat_count": 6,
        ]
        let step = ResponseParser.parseStep(from: dict, order: 0)
        #expect(step.stepType == .work)
        #expect(step.name == "800m repeat")
        #expect(step.goalType == .distance)
        #expect(step.goalValue == 800.0)
        #expect(step.repeatCount == 6)
        #expect(step.hrZone == 4)
    }

    @Test("Parse step defaults for missing fields")
    func parseStepDefaults() {
        let step = ResponseParser.parseStep(from: [:], order: 3)
        #expect(step.order == 3)
        #expect(step.stepType == .work)
        #expect(step.goalType == .open)
        #expect(step.repeatCount == 1)
    }

    // MARK: - parsePlan integration tests

    @Test("parsePlan creates correct plan structure from full JSON")
    func parsePlanFullStructure() throws {
        let context = try Self.makeTestContext()

        // Use a known Monday as startDate so day_of_week math is predictable.
        // 2025-01-06 is a Monday.
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let startDate = calendar.date(from: DateComponents(year: 2025, month: 1, day: 6))!

        let json = """
        {
            "name": "Half Marathon Plan",
            "goal_description": "Sub 1:45 half marathon",
            "difficulty": "advanced",
            "weeks": [
                {
                    "week_number": 1,
                    "theme": "Base Building",
                    "total_distance_km": 40.0,
                    "notes": "Easy start",
                    "workouts": [
                        {
                            "name": "Easy Run",
                            "type": "easy",
                            "day_of_week": 2,
                            "distance_km": 8.0,
                            "duration_minutes": 48.0,
                            "target_pace_min_per_km": 6.0,
                            "location": "outdoor",
                            "notes": "Keep it easy",
                            "steps": [
                                {
                                    "type": "warmup",
                                    "name": "Warmup Jog",
                                    "goal_type": "time",
                                    "goal_value": 600.0
                                },
                                {
                                    "type": "work",
                                    "name": "Steady Run",
                                    "goal_type": "distance",
                                    "goal_value": 6000.0,
                                    "target_pace_min_per_km": 6.0
                                },
                                {
                                    "type": "cooldown",
                                    "name": "Cooldown",
                                    "goal_type": "time",
                                    "goal_value": 300.0
                                }
                            ]
                        },
                        {
                            "name": "Long Run",
                            "type": "long",
                            "day_of_week": 7,
                            "distance_km": 16.0,
                            "duration_minutes": 96.0,
                            "target_pace_min_per_km": 6.0,
                            "location": "trail",
                            "notes": "Stay comfortable"
                        }
                    ]
                },
                {
                    "week_number": 2,
                    "theme": "Build Phase",
                    "total_distance_km": 45.0,
                    "notes": "Increase volume",
                    "workouts": [
                        {
                            "name": "Tempo Run",
                            "type": "tempo",
                            "day_of_week": 4,
                            "distance_km": 10.0,
                            "duration_minutes": 50.0,
                            "target_pace_min_per_km": 5.0,
                            "location": "outdoor",
                            "notes": "Comfortably hard"
                        }
                    ]
                }
            ]
        }
        """

        let plan = try ResponseParser.parsePlan(from: json, startDate: startDate, context: context)

        // Plan-level assertions
        #expect(plan.name == "Half Marathon Plan")
        #expect(plan.goalDescription == "Sub 1:45 half marathon")
        #expect(plan.difficulty == .advanced)
        #expect(plan.startDate == startDate)
        #expect(plan.rawAIResponse == json)

        // Weeks
        let weeks = plan.sortedWeeks
        #expect(weeks.count == 2)

        let week1 = weeks[0]
        #expect(week1.weekNumber == 1)
        #expect(week1.theme == "Base Building")
        #expect(week1.totalDistanceKm == 40.0)
        #expect(week1.notes == "Easy start")
        #expect(week1.plan?.id == plan.id)

        let week2 = weeks[1]
        #expect(week2.weekNumber == 2)
        #expect(week2.theme == "Build Phase")
        #expect(week2.totalDistanceKm == 45.0)

        // Workouts in week 1
        let week1Workouts = week1.sortedWorkouts
        #expect(week1Workouts.count == 2)

        let easyRun = week1Workouts[0]
        #expect(easyRun.name == "Easy Run")
        #expect(easyRun.workoutType == .easy)
        #expect(easyRun.distanceKm == 8.0)
        #expect(easyRun.durationMinutes == 48.0)
        #expect(easyRun.targetPaceMinPerKm == 6.0)
        #expect(easyRun.location == .outdoor)
        #expect(easyRun.notes == "Keep it easy")
        #expect(easyRun.week?.id == week1.id)

        let longRun = week1Workouts[1]
        #expect(longRun.name == "Long Run")
        #expect(longRun.workoutType == .long)
        #expect(longRun.location == .trail)
        #expect(longRun.distanceKm == 16.0)

        // Steps on the easy run
        let steps = easyRun.sortedSteps
        #expect(steps.count == 3)

        #expect(steps[0].stepType == .warmup)
        #expect(steps[0].name == "Warmup Jog")
        #expect(steps[0].goalType == .time)
        #expect(steps[0].goalValue == 600.0)
        #expect(steps[0].order == 0)

        #expect(steps[1].stepType == .work)
        #expect(steps[1].name == "Steady Run")
        #expect(steps[1].goalType == .distance)
        #expect(steps[1].goalValue == 6000.0)
        #expect(steps[1].targetPaceMinPerKm == 6.0)
        #expect(steps[1].order == 1)

        #expect(steps[2].stepType == .cooldown)
        #expect(steps[2].name == "Cooldown")
        #expect(steps[2].goalType == .time)
        #expect(steps[2].goalValue == 300.0)
        #expect(steps[2].order == 2)

        // Workouts in week 2
        let week2Workouts = week2.sortedWorkouts
        #expect(week2Workouts.count == 1)
        #expect(week2Workouts[0].name == "Tempo Run")
        #expect(week2Workouts[0].workoutType == .tempo)

        // Long run (day 7 = Saturday) has no steps
        #expect(longRun.sortedSteps.isEmpty)

        // endDate should be the latest workout date
        #expect(plan.endDate >= easyRun.scheduledDate)
        #expect(plan.endDate >= longRun.scheduledDate)
        #expect(plan.endDate >= week2Workouts[0].scheduledDate)
    }

    @Test("parsePlan handles missing optional fields with defaults")
    func parsePlanMinimalJSON() throws {
        let context = try Self.makeTestContext()
        let startDate = Date()

        // Minimal JSON: no name, no goal_description, no difficulty, workouts with no optional fields
        let json = """
        {
            "weeks": [
                {
                    "workouts": [
                        {
                            "steps": [
                                {}
                            ]
                        }
                    ]
                }
            ]
        }
        """

        let plan = try ResponseParser.parsePlan(from: json, startDate: startDate, context: context)

        // Plan defaults
        #expect(plan.name == "Training Plan")
        #expect(plan.goalDescription == "")
        #expect(plan.difficulty == .intermediate)

        // Week defaults
        let week = plan.sortedWeeks.first
        #expect(week != nil)
        #expect(week?.weekNumber == 1)
        #expect(week?.theme == "")
        #expect(week?.totalDistanceKm == 0)
        #expect(week?.notes == "")

        // Workout defaults
        let workout = week?.sortedWorkouts.first
        #expect(workout != nil)
        #expect(workout?.name == "Workout")
        #expect(workout?.workoutType == .easy)
        #expect(workout?.distanceKm == 0)
        #expect(workout?.durationMinutes == 0)
        #expect(workout?.targetPaceMinPerKm == nil)
        #expect(workout?.location == .outdoor)
        #expect(workout?.notes == "")

        // Step defaults
        let step = workout?.sortedSteps.first
        #expect(step != nil)
        #expect(step?.order == 0)
        #expect(step?.stepType == .work)
        #expect(step?.goalType == .open)
        #expect(step?.goalValue == nil)
        #expect(step?.targetPaceMinPerKm == nil)
        #expect(step?.hrZone == nil)
        #expect(step?.repeatCount == 1)
        #expect(step?.groupId == 0)
    }

    @Test("parsePlan throws when weeks array is missing")
    func parsePlanMissingWeeks() throws {
        let context = try Self.makeTestContext()
        let json = """
        {"name": "No weeks plan"}
        """
        #expect(throws: ResponseParser.ParseError.self) {
            try ResponseParser.parsePlan(from: json, startDate: Date(), context: context)
        }
    }

    @Test("parsePlan calculates scheduledDate correctly from week_number and day_of_week")
    func parsePlanScheduledDateCalculation() throws {
        let context = try Self.makeTestContext()

        // 2025-01-06 is a Monday (weekday 2 in the Gregorian calendar).
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let startDate = calendar.date(from: DateComponents(year: 2025, month: 1, day: 6))!

        let json = """
        {
            "name": "Schedule Test",
            "weeks": [
                {
                    "week_number": 1,
                    "workouts": [
                        {"name": "Monday W1", "day_of_week": 2},
                        {"name": "Wednesday W1", "day_of_week": 4},
                        {"name": "Saturday W1", "day_of_week": 7}
                    ]
                },
                {
                    "week_number": 2,
                    "workouts": [
                        {"name": "Tuesday W2", "day_of_week": 3},
                        {"name": "Friday W2", "day_of_week": 6}
                    ]
                }
            ]
        }
        """

        let plan = try ResponseParser.parsePlan(from: json, startDate: startDate, context: context)
        let weeks = plan.sortedWeeks

        // Week 1 workouts
        let w1Workouts = weeks[0].sortedWorkouts
        #expect(w1Workouts.count == 3)

        let systemCalendar = Calendar.current

        // Monday W1: day_of_week=2, week 1 → should be the startDate itself (Monday Jan 6)
        let mondayW1 = w1Workouts.first { $0.name == "Monday W1" }!
        let mondayComponents = systemCalendar.dateComponents([.year, .month, .day], from: mondayW1.scheduledDate)
        #expect(mondayComponents.year == 2025)
        #expect(mondayComponents.month == 1)
        #expect(mondayComponents.day == 6)

        // Wednesday W1: day_of_week=4, week 1 → Wednesday Jan 8
        let wednesdayW1 = w1Workouts.first { $0.name == "Wednesday W1" }!
        let wedComponents = systemCalendar.dateComponents([.year, .month, .day], from: wednesdayW1.scheduledDate)
        #expect(wedComponents.year == 2025)
        #expect(wedComponents.month == 1)
        #expect(wedComponents.day == 8)

        // Saturday W1: day_of_week=7, week 1 → Saturday Jan 11
        let saturdayW1 = w1Workouts.first { $0.name == "Saturday W1" }!
        let satComponents = systemCalendar.dateComponents([.year, .month, .day], from: saturdayW1.scheduledDate)
        #expect(satComponents.year == 2025)
        #expect(satComponents.month == 1)
        #expect(satComponents.day == 11)

        // Week 2 workouts (start = Jan 13, one week after Jan 6)
        let w2Workouts = weeks[1].sortedWorkouts
        #expect(w2Workouts.count == 2)

        // Tuesday W2: day_of_week=3, week 2 → Tuesday Jan 14
        let tuesdayW2 = w2Workouts.first { $0.name == "Tuesday W2" }!
        let tueComponents = systemCalendar.dateComponents([.year, .month, .day], from: tuesdayW2.scheduledDate)
        #expect(tueComponents.year == 2025)
        #expect(tueComponents.month == 1)
        #expect(tueComponents.day == 14)

        // Friday W2: day_of_week=6, week 2 → Friday Jan 17
        let fridayW2 = w2Workouts.first { $0.name == "Friday W2" }!
        let friComponents = systemCalendar.dateComponents([.year, .month, .day], from: fridayW2.scheduledDate)
        #expect(friComponents.year == 2025)
        #expect(friComponents.month == 1)
        #expect(friComponents.day == 17)

        // endDate should equal the latest workout (Friday Jan 17)
        let endComponents = systemCalendar.dateComponents([.year, .month, .day], from: plan.endDate)
        #expect(endComponents.year == 2025)
        #expect(endComponents.month == 1)
        #expect(endComponents.day == 17)
    }

    @Test("parsePlan extracts JSON from markdown code block wrapper")
    func parsePlanFromCodeBlock() throws {
        let context = try Self.makeTestContext()

        let responseText = """
        Here is your training plan:
        ```json
        {
            "name": "5K Plan",
            "goal_description": "Run a 5K",
            "weeks": [
                {
                    "week_number": 1,
                    "theme": "Easy Week",
                    "total_distance_km": 20,
                    "workouts": []
                }
            ]
        }
        ```
        Let me know if you'd like any adjustments!
        """

        let plan = try ResponseParser.parsePlan(from: responseText, startDate: Date(), context: context)
        #expect(plan.name == "5K Plan")
        #expect(plan.goalDescription == "Run a 5K")
        #expect(plan.sortedWeeks.count == 1)
        #expect(plan.sortedWeeks[0].theme == "Easy Week")
    }
}
