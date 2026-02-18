import SwiftUI

struct CoachingMessageBubble: View {
    let message: CoachingMessage

    var body: some View {
        switch message.role {
        case .user:
            HStack {
                Spacer(minLength: 60)
                Text(message.content)
                    .padding(12)
                    .background(Theme.accentGradient, in: RoundedRectangle(cornerRadius: 16))
                    .foregroundStyle(.white)
            }

        case .assistant:
            HStack {
                Text(LocalizedStringKey(message.content))
                    .padding(12)
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
                Spacer(minLength: 60)
            }

        case .tool:
            HStack(spacing: 6) {
                Image(systemName: "wrench.and.screwdriver")
                    .font(.caption2)
                    .foregroundStyle(Theme.accent)
                Text(toolDisplayName(message.toolName ?? message.content))
                    .font(.caption.monospaced())
                    .italic()
                    .foregroundStyle(.secondary)
                Spacer()
            }
            .padding(.horizontal, 4)

        case .toolResult:
            EmptyView()
        }
    }

    private func toolDisplayName(_ name: String) -> String {
        switch name {
        case "get_active_plan": return "Looking up your plan..."
        case "get_week_workouts": return "Checking this week's workouts..."
        case "get_workout_details": return "Looking up workout details..."
        case "get_running_history": return "Checking your running history..."
        case "get_runner_profile": return "Reading your profile..."
        case "update_workout": return "Updating workout..."
        case "swap_workout_dates": return "Swapping workout dates..."
        case "skip_workout": return "Marking workout as skipped..."
        case "set_week_workouts": return "Creating workouts for the week..."
        default: return "Working..."
        }
    }
}

#Preview {
    VStack(spacing: 12) {
        CoachingMessageBubble(message: CoachingMessage(role: .user, content: "What's my plan this week?"))
        CoachingMessageBubble(message: CoachingMessage(role: .tool, content: "get_active_plan", toolName: "get_active_plan"))
        CoachingMessageBubble(message: CoachingMessage(role: .assistant, content: "You have **3 workouts** planned this week. Your long run is on Saturday at 16 km."))
    }
    .padding()
}
