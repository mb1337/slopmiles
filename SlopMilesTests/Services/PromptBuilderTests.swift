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
}
