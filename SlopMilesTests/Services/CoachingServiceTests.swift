import Testing
import Foundation
import SwiftData
@testable import SlopMiles

@Suite("CoachingService Tests")
@MainActor
struct CoachingServiceTests {
    private static func makeTestContext() throws -> ModelContext {
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        let container = try ModelContainer(
            for: TrainingPlan.self,
            TrainingWeek.self,
            PlannedWorkout.self,
            PlannedWorkoutStep.self,
            UserProfile.self,
            WeeklySchedule.self,
            RunnerEquipment.self,
            AISettings.self,
            CoachingConversation.self,
            configurations: config
        )
        return ModelContext(container)
    }

    @Test("Cross-turn tool-use history drops assistant tool-call metadata")
    func crossTurnToolUseHistoryDropsAssistantToolCallMetadata() async throws {
        let context = try Self.makeTestContext()
        let conversation = CoachingConversation()
        context.insert(conversation)

        let settings = AISettings()
        settings.provider = .anthropic

        let toolCall = ToolCall(id: "tool-call-1", name: "get_active_plan", arguments: [:])
        let provider = MockAIProvider()
        provider.responses = [
            AIResponse(
                message: AIMessage(role: .assistant, content: "", toolCalls: [toolCall]),
                stopReason: .toolUse,
                usage: nil
            ),
            AIResponse(
                message: AIMessage(role: .assistant, content: ""),
                stopReason: .endTurn,
                usage: nil
            ),
            AIResponse(
                message: AIMessage(role: .assistant, content: "Acknowledged."),
                stopReason: .endTurn,
                usage: nil
            ),
        ]

        let service = CoachingService(keychainService: KeychainService())
        service.providerOverride = provider

        await service.sendMessage(
            "Please check my plan",
            conversation: conversation,
            settings: settings,
            context: context,
            healthKitService: HealthKitService(),
            workoutKitService: WorkoutKitService(),
            calendarService: CalendarService()
        )

        await service.sendMessage(
            "Anything else I should know?",
            conversation: conversation,
            settings: settings,
            context: context,
            healthKitService: HealthKitService(),
            workoutKitService: WorkoutKitService(),
            calendarService: CalendarService()
        )

        #expect(provider.receivedMessages.count >= 3)
        let secondTurnMessages = provider.receivedMessages[2]

        // Reconstructed history still contains a tool result...
        #expect(secondTurnMessages.contains(where: { $0.role == .tool }))
        // ...but does not preserve the assistant tool-call metadata that produced it.
        #expect(!secondTurnMessages.contains(where: { msg in
            msg.role == .assistant && !(msg.toolCalls?.isEmpty ?? true)
        }))
    }
}
