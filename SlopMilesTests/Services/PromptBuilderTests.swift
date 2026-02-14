import Testing
import Foundation
@testable import SlopMiles

@Suite("Prompt Builder Tests")
struct PromptBuilderTests {
    @Test("System prompt contains key instructions")
    func systemPromptContent() {
        let prompt = PromptBuilder.systemPrompt()
        #expect(prompt.contains("check_mileage_progression"))
        #expect(prompt.contains("get_training_paces"))
        #expect(prompt.contains("calculate_vdot"))
        #expect(prompt.contains("JSON"))
        #expect(prompt.contains("recovery weeks"))
    }

    @Test("User prompt includes profile data")
    func userPromptIncludesProfile() {
        let profile = UserProfile()
        profile.experienceLevel = .advanced
        profile.currentWeeklyMileageKm = 60

        let prompt = PromptBuilder.userPrompt(
            profile: profile, schedule: WeeklySchedule(), equipment: RunnerEquipment(),
            stats: RunningStats(), goalDescription: "Run a sub-3:30 marathon",
            raceDistance: 42195, raceDate: Date(), startDate: Date(), endDate: Date()
        )

        #expect(prompt.contains("advanced"))
        #expect(prompt.contains("60"))
        #expect(prompt.contains("42195"))
        #expect(prompt.contains("sub-3:30 marathon"))
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

    @Test("Output schema contains expected fields")
    func outputSchemaStructure() {
        let schema = PromptBuilder.outputSchema()
        #expect(schema.contains("weeks"))
        #expect(schema.contains("workouts"))
        #expect(schema.contains("steps"))
        #expect(schema.contains("target_pace_min_per_km"))
    }

    @Test("Time-mode system prompt references weekly_durations_minutes")
    func timeBasedSystemPrompt() {
        let prompt = PromptBuilder.systemPrompt(volumeType: .time)
        #expect(prompt.contains("weekly_durations_minutes"))
        #expect(prompt.contains("total_duration_minutes"))
        #expect(prompt.contains("duration_minutes"))
    }

    @Test("Time-mode output schema uses total_duration_minutes")
    func timeBasedOutputSchema() {
        let schema = PromptBuilder.outputSchema(volumeType: .time)
        #expect(schema.contains("total_duration_minutes"))
        #expect(!schema.contains("total_distance_km"))
    }

    @Test("Distance-mode output schema uses total_distance_km")
    func distanceBasedOutputSchema() {
        let schema = PromptBuilder.outputSchema(volumeType: .distance)
        #expect(schema.contains("total_distance_km"))
        #expect(!schema.contains("total_duration_minutes"))
    }

    @Test("Time-mode user prompt shows volume in minutes")
    func timeBasedUserPrompt() {
        let profile = UserProfile()
        profile.volumeType = .time
        profile.currentWeeklyVolumeMinutes = 300

        let prompt = PromptBuilder.userPrompt(
            profile: profile, schedule: WeeklySchedule(), equipment: RunnerEquipment(),
            stats: RunningStats(), goalDescription: "Build base",
            raceDistance: nil, raceDate: nil, startDate: Date(), endDate: Date()
        )

        #expect(prompt.contains("300 minutes"))
        #expect(prompt.contains("time-based"))
        #expect(!prompt.contains("Current weekly mileage"))
    }
}
