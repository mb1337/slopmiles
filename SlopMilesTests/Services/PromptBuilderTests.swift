import Testing
import Foundation
@testable import SlopMiles

@Suite("Prompt Builder Tests")
struct PromptBuilderTests {
    @Test("System prompt contains key instructions")
    func systemPromptContent() {
        let prompt = PromptBuilder.systemPrompt()
        #expect(prompt.contains("check_mileage_progression"))
        #expect(prompt.contains("calculate_vdot"))
        #expect(prompt.contains("JSON"))
        #expect(prompt.contains("recovery weeks"))
        #expect(prompt.contains("weekly_volume_percent"))
        #expect(prompt.contains("daily_volume_percent"))
        #expect(prompt.contains("intensity"))
        // Volume constraint rules
        #expect(prompt.contains("MUST EQUAL the weekly_volume_percent"))
        #expect(prompt.contains("100% of peak weekly volume"))
        // Should NOT contain old tool references
        #expect(!prompt.contains("get_training_paces"))
        #expect(!prompt.contains("target_pace_min_per_km"))
    }

    @Test("User prompt includes profile data")
    func userPromptIncludesProfile() {
        let profile = UserProfile()
        profile.experienceLevel = .advanced
        profile.peakWeeklyMileageKm = 60

        let prompt = PromptBuilder.userPrompt(
            profile: profile, schedule: WeeklySchedule(), equipment: RunnerEquipment(),
            stats: RunningStats(), goalDescription: "Run a sub-3:30 marathon",
            raceDistance: 42195, raceDate: Date(), startDate: Date(), endDate: Date()
        )

        #expect(prompt.contains("advanced"))
        #expect(prompt.contains("60"))
        #expect(prompt.contains("42195"))
        #expect(prompt.contains("sub-3:30 marathon"))
        #expect(prompt.contains("Peak weekly mileage"))
    }

    @Test("User prompt includes injury notes when present")
    func userPromptIncludesInjuries() {
        let profile = UserProfile()
        profile.injuryNotes = "Left knee tendinitis"

        let prompt = PromptBuilder.userPrompt(
            profile: profile, schedule: WeeklySchedule(), equipment: RunnerEquipment(),
            stats: RunningStats(), goalDescription: "General fitness",
            raceDistance: nil, raceDate: nil, startDate: Date(), endDate: Date()
        )

        #expect(prompt.contains("Left knee tendinitis"))
    }

    @Test("Output schema contains percentage-based fields")
    func outputSchemaStructure() {
        let schema = PromptBuilder.outputSchema()
        #expect(schema.contains("weeks"))
        #expect(schema.contains("workouts"))
        #expect(schema.contains("steps"))
        #expect(schema.contains("weekly_volume_percent"))
        #expect(schema.contains("daily_volume_percent"))
        #expect(schema.contains("intensity"))
        // Should NOT contain old absolute fields
        #expect(!schema.contains("target_pace_min_per_km"))
        #expect(!schema.contains("\"distance_km\""))
        #expect(!schema.contains("\"duration_minutes\""))
    }

    @Test("Time-mode user prompt shows volume in minutes")
    func timeBasedUserPrompt() {
        let profile = UserProfile()
        profile.volumeType = .time
        profile.peakWeeklyVolumeMinutes = 300

        let prompt = PromptBuilder.userPrompt(
            profile: profile, schedule: WeeklySchedule(), equipment: RunnerEquipment(),
            stats: RunningStats(), goalDescription: "Build base",
            raceDistance: nil, raceDate: nil, startDate: Date(), endDate: Date()
        )

        #expect(prompt.contains("300 minutes"))
        #expect(prompt.contains("time-based"))
        #expect(prompt.contains("Peak weekly running volume"))
    }

    // MARK: - Outline prompts

    @Test("Outline system prompt instructs plan skeleton only")
    func outlineSystemPromptContent() {
        let prompt = PromptBuilder.outlineSystemPrompt()
        #expect(prompt.contains("plan outline"))
        #expect(prompt.contains("Do NOT generate individual workouts"))
        #expect(prompt.contains("weekly_volume_percent"))
        #expect(prompt.contains("100% of peak weekly volume"))
        // Should NOT contain old fields
        #expect(!prompt.contains("training_paces"))
        #expect(!prompt.contains("target_distance_km"))
        #expect(!prompt.contains("get_training_paces"))
    }

    @Test("Outline user prompt appends outline instruction")
    func outlineUserPromptContent() {
        let prompt = PromptBuilder.outlineUserPrompt(
            profile: UserProfile(), schedule: WeeklySchedule(), equipment: RunnerEquipment(),
            stats: RunningStats(), goalDescription: "Run a 5K",
            raceDistance: 5000, raceDate: Date(), startDate: Date(), endDate: Date()
        )

        #expect(prompt.contains("ONLY the plan outline"))
        #expect(prompt.contains("Do NOT generate individual workouts"))
    }

    // MARK: - Weekly prompts

    @Test("Weekly system prompt contains performance adaptation rules")
    func weeklySystemPromptContent() {
        let prompt = PromptBuilder.weeklySystemPrompt()
        #expect(prompt.contains("Performance Adaptation Rules"))
        #expect(prompt.contains("75%"))
        #expect(prompt.contains("Scheduling Rules"))
        #expect(prompt.contains("daily_volume_percent"))
        #expect(prompt.contains("intensity"))
        #expect(prompt.contains("MUST EQUAL the weekly_volume_percent"))
    }

    @Test("Weekly user prompt includes plan context and performance data")
    func weeklyUserPromptContent() {
        let plan = TrainingPlan(name: "Test Plan", goalDescription: "Run a 5K", startDate: Date(), endDate: Date())
        plan.cachedVDOT = 45.0
        let week = TrainingWeek(weekNumber: 3, theme: "Build Phase", totalDistanceKm: 40)
        week.weeklyVolumePercent = 80

        var perfData = WeeklyPerformanceData()
        perfData.priorWeekSummaries = [
            .init(weekNumber: 1, theme: "Base", plannedDistanceKm: 30, plannedDurationMinutes: 0, completedWorkouts: 4, totalWorkouts: 5, skippedWorkouts: 1),
            .init(weekNumber: 2, theme: "Build", plannedDistanceKm: 35, plannedDurationMinutes: 0, completedWorkouts: 5, totalWorkouts: 5, skippedWorkouts: 0),
        ]

        let prompt = PromptBuilder.weeklyUserPrompt(
            plan: plan, week: week,
            profile: UserProfile(), schedule: WeeklySchedule(), equipment: RunnerEquipment(),
            performanceData: perfData
        )

        #expect(prompt.contains("Week 3"))
        #expect(prompt.contains("Build Phase"))
        #expect(prompt.contains("VDOT: 45.0"))
        #expect(prompt.contains("80% of peak"))
        #expect(prompt.contains("Prior Weeks Performance"))
        #expect(prompt.contains("4/5 workouts completed"))
        #expect(prompt.contains("1 skipped"))
    }

    @Test("Weekly output schema contains percentage-based fields")
    func weeklyOutputSchemaContent() {
        let schema = PromptBuilder.weeklyOutputSchema()
        #expect(schema.contains("workouts"))
        #expect(schema.contains("steps"))
        #expect(schema.contains("day_of_week"))
        #expect(schema.contains("weekly_volume_percent"))
        #expect(schema.contains("daily_volume_percent"))
        #expect(schema.contains("intensity"))
    }

    @Test("VDOT shown without get_training_paces instruction")
    func vdotWithoutPacesInstruction() {
        let profile = UserProfile()
        profile.vdot = 50.0

        let prompt = PromptBuilder.userPrompt(
            profile: profile, schedule: WeeklySchedule(), equipment: RunnerEquipment(),
            stats: RunningStats(), goalDescription: "Run a 10K",
            raceDistance: nil, raceDate: nil, startDate: Date(), endDate: Date()
        )

        #expect(prompt.contains("VDOT: 50.0"))
        #expect(!prompt.contains("get_training_paces"))
    }
}
