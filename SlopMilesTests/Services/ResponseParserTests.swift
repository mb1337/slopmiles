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
        {"name": "Marathon Plan", "weeks": [{"week_number": 1, "theme": "Base", "weekly_volume_percent": 80, "notes": "", "workouts": []}]}
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

    @Test("Parse workout from dictionary with percentage volume")
    func parseWorkoutPercentage() {
        let ctx = PlanParseContext(peakVolume: 50.0, volumeType: .distance, vdot: 50.0)
        let dict: [String: Any] = [
            "name": "Easy Run", "type": "easy", "day_of_week": 2,
            "daily_volume_percent": 16.0,
            "intensity": "easy",
            "location": "outdoor", "notes": "Keep it easy",
        ]
        let workout = ResponseParser.parseWorkout(from: dict, weekNumber: 1, planStartDate: Date(), calendar: Calendar.current, context: ctx)
        #expect(workout.name == "Easy Run")
        #expect(workout.workoutType == .easy)
        #expect(workout.dailyVolumePercent == 16.0)
        #expect(workout.distanceKm == 8.0) // 16% of 50km
        #expect(workout.intensityTarget == .named(.easy))
        #expect(workout.targetPaceMinPerKm != nil)
        #expect(workout.location == .outdoor)
    }

    @Test("Parse workout falls back to absolute values without context")
    func parseWorkoutFallback() {
        let dict: [String: Any] = [
            "name": "Easy Run", "type": "easy", "day_of_week": 2,
            "distance_km": 8.0, "duration_minutes": 48.0,
            "target_pace_min_per_km": 6.0, "location": "outdoor", "notes": "Keep it easy",
        ]
        let workout = ResponseParser.parseWorkout(from: dict, weekNumber: 1, planStartDate: Date(), calendar: Calendar.current)
        #expect(workout.name == "Easy Run")
        #expect(workout.distanceKm == 8.0)
        #expect(workout.targetPaceMinPerKm == 6.0)
    }

    @Test("Parse step with named intensity")
    func parseStepNamedIntensity() {
        let dict: [String: Any] = [
            "type": "work", "name": "800m repeat", "goal_type": "distance",
            "goal_value": 800.0, "intensity": "interval", "hr_zone": 4, "repeat_count": 6,
        ]
        let step = ResponseParser.parseStep(from: dict, order: 0, vdot: 50.0)
        #expect(step.stepType == .work)
        #expect(step.name == "800m repeat")
        #expect(step.goalType == .distance)
        #expect(step.goalValue == 800.0)
        #expect(step.repeatCount == 6)
        #expect(step.hrZone == 4)
        #expect(step.intensityTarget == .named(.interval))
        #expect(step.targetPaceMinPerKm != nil)
    }

    @Test("Parse step with VO2max intensity")
    func parseStepVo2maxIntensity() {
        let dict: [String: Any] = [
            "type": "work", "name": "Cruise intervals", "goal_type": "distance",
            "goal_value": 1600.0, "intensity": 96, "repeat_count": 4,
        ]
        let step = ResponseParser.parseStep(from: dict, order: 0, vdot: 50.0)
        #expect(step.intensityTarget == .vo2Max(96.0))
        #expect(step.targetPaceMinPerKm != nil)
    }

    @Test("Parse step defaults for missing fields")
    func parseStepDefaults() {
        let step = ResponseParser.parseStep(from: [:], order: 3)
        #expect(step.order == 3)
        #expect(step.stepType == .work)
        #expect(step.goalType == .open)
        #expect(step.repeatCount == 1)
        #expect(step.intensityTarget == .named(.easy))
    }

    // MARK: - parsePlan integration tests

    @Test("parsePlan creates correct plan structure with percentage volume")
    func parsePlanWithPercentages() throws {
        let context = try Self.makeTestContext()

        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let startDate = calendar.date(from: DateComponents(year: 2025, month: 1, day: 6))!

        let parseCtx = PlanParseContext(peakVolume: 50.0, volumeType: .distance, vdot: 50.0)

        let json = """
        {
            "name": "Half Marathon Plan",
            "goal_description": "Sub 1:45 half marathon",
            "difficulty": "advanced",
            "weeks": [
                {
                    "week_number": 1,
                    "theme": "Base Building",
                    "weekly_volume_percent": 80,
                    "notes": "Easy start",
                    "workouts": [
                        {
                            "name": "Easy Run",
                            "type": "easy",
                            "day_of_week": 2,
                            "daily_volume_percent": 16,
                            "intensity": "easy",
                            "location": "outdoor",
                            "notes": "Keep it easy",
                            "steps": [
                                {
                                    "type": "work",
                                    "name": "Easy Run",
                                    "goal_type": "distance",
                                    "goal_value": 8000.0,
                                    "intensity": "easy"
                                }
                            ]
                        },
                        {
                            "name": "Long Run",
                            "type": "long",
                            "day_of_week": 7,
                            "daily_volume_percent": 32,
                            "intensity": "easy",
                            "location": "trail",
                            "notes": "Stay comfortable"
                        }
                    ]
                },
                {
                    "week_number": 2,
                    "theme": "Build Phase",
                    "weekly_volume_percent": 90,
                    "notes": "Increase volume",
                    "workouts": [
                        {
                            "name": "Tempo Run",
                            "type": "tempo",
                            "day_of_week": 4,
                            "daily_volume_percent": 20,
                            "intensity": "tempo",
                            "location": "outdoor",
                            "notes": "Comfortably hard"
                        }
                    ]
                }
            ]
        }
        """

        let plan = try ResponseParser.parsePlan(from: json, startDate: startDate, context: context, parseContext: parseCtx)

        // Plan-level assertions
        #expect(plan.name == "Half Marathon Plan")
        #expect(plan.goalDescription == "Sub 1:45 half marathon")
        #expect(plan.difficulty == .advanced)

        // Weeks
        let weeks = plan.sortedWeeks
        #expect(weeks.count == 2)

        let week1 = weeks[0]
        #expect(week1.weekNumber == 1)
        #expect(week1.weeklyVolumePercent == 80)
        #expect(week1.totalDistanceKm == 40.0) // 80% of 50km

        let week2 = weeks[1]
        #expect(week2.weeklyVolumePercent == 90)
        #expect(week2.totalDistanceKm == 45.0) // 90% of 50km

        // Workouts in week 1
        let week1Workouts = week1.sortedWorkouts
        #expect(week1Workouts.count == 2)

        let easyRun = week1Workouts[0]
        #expect(easyRun.name == "Easy Run")
        #expect(easyRun.dailyVolumePercent == 16)
        #expect(easyRun.distanceKm == 8.0) // 16% of 50km
        #expect(easyRun.intensityTarget == .named(.easy))
        #expect(easyRun.targetPaceMinPerKm != nil)

        // Steps on the easy run
        let steps = easyRun.sortedSteps
        #expect(steps.count == 1)
        #expect(steps[0].intensityTarget == .named(.easy))
        #expect(steps[0].targetPaceMinPerKm != nil)
    }

    @Test("parsePlan handles missing optional fields with defaults")
    func parsePlanMinimalJSON() throws {
        let context = try Self.makeTestContext()
        let startDate = Date()

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

        #expect(plan.name == "Training Plan")
        #expect(plan.goalDescription == "")
        #expect(plan.difficulty == .intermediate)

        let week = plan.sortedWeeks.first
        #expect(week != nil)
        #expect(week?.weekNumber == 1)
        #expect(week?.theme == "")
        #expect(week?.totalDistanceKm == 0)

        let workout = week?.sortedWorkouts.first
        #expect(workout != nil)
        #expect(workout?.name == "Workout")
        #expect(workout?.workoutType == .easy)
        #expect(workout?.intensityTarget == .named(.easy))

        let step = workout?.sortedSteps.first
        #expect(step != nil)
        #expect(step?.order == 0)
        #expect(step?.stepType == .work)
        #expect(step?.goalType == .open)
        #expect(step?.repeatCount == 1)
        #expect(step?.groupId == 0)
        #expect(step?.intensityTarget == .named(.easy))
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

        let w1Workouts = weeks[0].sortedWorkouts
        #expect(w1Workouts.count == 3)

        let systemCalendar = Calendar.current

        let mondayW1 = w1Workouts.first { $0.name == "Monday W1" }!
        let mondayComponents = systemCalendar.dateComponents([.year, .month, .day], from: mondayW1.scheduledDate)
        #expect(mondayComponents.year == 2025)
        #expect(mondayComponents.month == 1)
        #expect(mondayComponents.day == 6)

        let wednesdayW1 = w1Workouts.first { $0.name == "Wednesday W1" }!
        let wedComponents = systemCalendar.dateComponents([.year, .month, .day], from: wednesdayW1.scheduledDate)
        #expect(wedComponents.day == 8)

        let saturdayW1 = w1Workouts.first { $0.name == "Saturday W1" }!
        let satComponents = systemCalendar.dateComponents([.year, .month, .day], from: saturdayW1.scheduledDate)
        #expect(satComponents.day == 11)

        let w2Workouts = weeks[1].sortedWorkouts
        #expect(w2Workouts.count == 2)

        let tuesdayW2 = w2Workouts.first { $0.name == "Tuesday W2" }!
        let tueComponents = systemCalendar.dateComponents([.year, .month, .day], from: tuesdayW2.scheduledDate)
        #expect(tueComponents.day == 14)

        let fridayW2 = w2Workouts.first { $0.name == "Friday W2" }!
        let friComponents = systemCalendar.dateComponents([.year, .month, .day], from: fridayW2.scheduledDate)
        #expect(friComponents.day == 17)
    }

    @Test("parsePlan parses time-based plan with percentage volume")
    func parsePlanTimeBased() throws {
        let context = try Self.makeTestContext()
        let startDate = Date()
        let parseCtx = PlanParseContext(peakVolume: 300.0, volumeType: .time, vdot: nil)

        let json = """
        {
            "name": "Time-Based Plan",
            "goal_description": "Build aerobic base",
            "weeks": [
                {
                    "week_number": 1,
                    "theme": "Base Week",
                    "weekly_volume_percent": 60,
                    "notes": "Easy start",
                    "workouts": [
                        {
                            "name": "Easy Run",
                            "type": "easy",
                            "day_of_week": 2,
                            "daily_volume_percent": 15,
                            "intensity": "easy",
                            "location": "outdoor",
                            "notes": "Keep it easy"
                        }
                    ]
                }
            ]
        }
        """

        let plan = try ResponseParser.parsePlan(from: json, startDate: startDate, context: context, parseContext: parseCtx)
        let weeks = plan.sortedWeeks
        #expect(weeks.count == 1)

        #expect(weeks[0].weeklyVolumePercent == 60)
        #expect(weeks[0].totalDurationMinutes == 180.0) // 60% of 300min
        #expect(weeks[0].totalDistanceKm == 0) // time-based, no distance

        let workouts = weeks[0].sortedWorkouts
        #expect(workouts.count == 1)
        #expect(workouts[0].dailyVolumePercent == 15)
        #expect(workouts[0].durationMinutes == 45.0) // 15% of 300min
    }

    // MARK: - parseOutline tests

    @Test("parseOutline creates plan with percentage-based weeks")
    func parseOutlineStructure() throws {
        let context = try Self.makeTestContext()

        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let startDate = calendar.date(from: DateComponents(year: 2025, month: 3, day: 1))!
        let endDate = calendar.date(from: DateComponents(year: 2025, month: 5, day: 24))!

        let parseCtx = PlanParseContext(peakVolume: 50.0, volumeType: .distance, vdot: 42.5)

        let json = """
        {
            "name": "10K Training Plan",
            "goal_description": "Sub-50 10K",
            "vdot": 42.5,
            "weeks": [
                {
                    "week_number": 1,
                    "theme": "Base Building",
                    "weekly_volume_percent": 70,
                    "focus": "Aerobic development",
                    "workout_types": ["easy", "long"],
                    "notes": "Easy start"
                },
                {
                    "week_number": 2,
                    "theme": "Build Phase",
                    "weekly_volume_percent": 80,
                    "focus": "Increasing volume",
                    "notes": "Add tempo work"
                }
            ]
        }
        """

        let plan = try ResponseParser.parseOutline(from: json, startDate: startDate, endDate: endDate, context: context, parseContext: parseCtx)

        #expect(plan.name == "10K Training Plan")
        #expect(plan.goalDescription == "Sub-50 10K")
        #expect(plan.cachedVDOT == 42.5)

        let weeks = plan.sortedWeeks
        #expect(weeks.count == 2)

        #expect(weeks[0].weeklyVolumePercent == 70)
        #expect(weeks[0].totalDistanceKm == 35.0) // 70% of 50km
        #expect(weeks[0].workoutsGenerated == false)

        #expect(weeks[1].weeklyVolumePercent == 80)
        #expect(weeks[1].totalDistanceKm == 40.0) // 80% of 50km
    }

    @Test("parseOutline stores integer vdot correctly")
    func parseOutlineIntegerVdot() throws {
        let context = try Self.makeTestContext()
        let json = """
        {"name":"Plan","vdot":45,"weeks":[{"week_number":1,"theme":"W1","weekly_volume_percent":100,"notes":""}]}
        """
        let plan = try ResponseParser.parseOutline(from: json, startDate: Date(), endDate: Date(), context: context)
        #expect(plan.cachedVDOT == 45.0)
    }

    @Test("parseOutline falls back to absolute values without context")
    func parseOutlineFallback() throws {
        let context = try Self.makeTestContext()
        let json = """
        {"name":"Plan","vdot":45,"weeks":[{"week_number":1,"theme":"W1","target_distance_km":35.0,"notes":""}]}
        """
        let plan = try ResponseParser.parseOutline(from: json, startDate: Date(), endDate: Date(), context: context)
        #expect(plan.sortedWeeks[0].totalDistanceKm == 35.0)
    }

    // MARK: - parseWeekWorkouts tests

    @Test("parseWeekWorkouts attaches workouts with percentage volume")
    func parseWeekWorkoutsAttachesWorkouts() throws {
        let context = try Self.makeTestContext()

        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let startDate = calendar.date(from: DateComponents(year: 2025, month: 1, day: 6))!

        let week = TrainingWeek(weekNumber: 1, theme: "Base", totalDistanceKm: 30)
        week.workoutsGenerated = false
        context.insert(week)

        let parseCtx = PlanParseContext(peakVolume: 50.0, volumeType: .distance, vdot: 50.0)

        let json = """
        {
            "week_number": 1,
            "theme": "Base Building",
            "weekly_volume_percent": 64,
            "notes": "Updated notes",
            "workouts": [
                {
                    "name": "Easy Run",
                    "type": "easy",
                    "day_of_week": 2,
                    "daily_volume_percent": 16,
                    "intensity": "easy",
                    "location": "outdoor",
                    "notes": "Relaxed pace",
                    "steps": [
                        {"type": "warmup", "name": "Warmup", "goal_type": "time", "goal_value": 300, "intensity": "easy"},
                        {"type": "work", "name": "Main", "goal_type": "distance", "goal_value": 6000, "intensity": "easy"}
                    ]
                },
                {
                    "name": "Long Run",
                    "type": "long",
                    "day_of_week": 7,
                    "daily_volume_percent": 32,
                    "intensity": "easy",
                    "location": "trail",
                    "notes": ""
                }
            ]
        }
        """

        try ResponseParser.parseWeekWorkouts(from: json, week: week, planStartDate: startDate, context: context, parseContext: parseCtx)

        #expect(week.workoutsGenerated == true)
        #expect(week.theme == "Base Building")
        #expect(week.weeklyVolumePercent == 64)
        #expect(week.totalDistanceKm == 32.0) // 64% of 50km
        #expect(week.notes == "Updated notes")

        let workouts = week.sortedWorkouts
        #expect(workouts.count == 2)
        #expect(workouts[0].name == "Easy Run")
        #expect(workouts[0].dailyVolumePercent == 16)
        #expect(workouts[0].distanceKm == 8.0) // 16% of 50km

        let steps = workouts[0].sortedSteps
        #expect(steps.count == 2)
        #expect(steps[0].stepType == .warmup)
        #expect(steps[0].intensityTarget == .named(.easy))
        #expect(steps[1].goalValue == 6000)
    }

    // MARK: - Intensity Parsing tests

    @Test("parseIntensity handles string values")
    func parseIntensityString() {
        #expect(ResponseParser.parseIntensity(from: "easy") == .named(.easy))
        #expect(ResponseParser.parseIntensity(from: "marathon") == .named(.marathon))
        #expect(ResponseParser.parseIntensity(from: "tempo") == .named(.tempo))
        #expect(ResponseParser.parseIntensity(from: "interval") == .named(.interval))
        #expect(ResponseParser.parseIntensity(from: "repeat") == .named(.repetition))
    }

    @Test("parseIntensity handles numeric values")
    func parseIntensityNumeric() {
        #expect(ResponseParser.parseIntensity(from: 96.0 as Double) == .vo2Max(96.0))
        #expect(ResponseParser.parseIntensity(from: 88 as Int) == .vo2Max(88.0))
    }

    @Test("parseIntensity defaults to easy for nil")
    func parseIntensityNil() {
        #expect(ResponseParser.parseIntensity(from: nil) == .named(.easy))
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
                    "weekly_volume_percent": 70,
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
