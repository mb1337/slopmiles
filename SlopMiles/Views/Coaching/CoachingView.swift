import SwiftUI
import SwiftData

struct CoachingView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \CoachingConversation.updatedAt, order: .reverse)
    private var conversations: [CoachingConversation]
    @Query private var aiSettings: [AISettings]
    @State private var inputText = ""
    @State private var sendTask: Task<Void, Never>?

    private var conversation: CoachingConversation {
        if let existing = conversations.first {
            return existing
        }
        let new = CoachingConversation()
        modelContext.insert(new)
        try? modelContext.save()
        return new
    }

    private var settings: AISettings {
        aiSettings.first ?? AISettings()
    }

    private var canSend: Bool {
        !inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        && !isThinking
    }

    private var isThinking: Bool {
        switch appState.coachingService.status {
        case .thinking, .executingTool: return true
        default: return false
        }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 10) {
                            ForEach(conversation.messages) { message in
                                CoachingMessageBubble(message: message)
                                    .id(message.id)
                            }

                            if isThinking {
                                thinkingIndicator
                                    .id("thinking")
                            }
                        }
                        .padding()
                    }
                    .onChange(of: conversation.messages.count) { _, _ in
                        scrollToBottom(proxy: proxy)
                    }
                    .onChange(of: isThinking) { _, _ in
                        scrollToBottom(proxy: proxy)
                    }
                }

                Divider()

                inputBar
            }
            .navigationTitle("Coach")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        startNewConversation()
                    } label: {
                        Image(systemName: "plus.message")
                    }
                    .disabled(isThinking)
                }
            }
        }
    }

    private var thinkingIndicator: some View {
        HStack {
            switch appState.coachingService.status {
            case .thinking:
                ProgressView()
                    .controlSize(.small)
                Text("Thinking...")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            case .executingTool(let name):
                ProgressView()
                    .controlSize(.small)
                Text(toolStatusText(name))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            default:
                EmptyView()
            }
            Spacer()
        }
    }

    private var inputBar: some View {
        HStack(spacing: 12) {
            TextField("Ask your coach...", text: $inputText, axis: .vertical)
                .textFieldStyle(.plain)
                .lineLimit(1...5)
                .onSubmit { send() }
                .accessibilityIdentifier(AccessibilityID.Coaching.messageInput)

            Button {
                send()
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.title2)
                    .foregroundStyle(canSend ? AnyShapeStyle(Theme.accentGradient) : AnyShapeStyle(.quaternary))
            }
            .disabled(!canSend)
            .accessibilityIdentifier(AccessibilityID.Coaching.sendButton)
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
    }

    private func send() {
        guard canSend else { return }
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        inputText = ""
        let conv = conversation
        let currentSettings = settings

        sendTask = Task {
            await appState.coachingService.sendMessage(
                text,
                conversation: conv,
                settings: currentSettings,
                context: modelContext,
                healthKitService: appState.healthKitService,
                workoutKitService: appState.workoutKitService,
                calendarService: appState.calendarService
            )
        }
    }

    private func startNewConversation() {
        let new = CoachingConversation()
        modelContext.insert(new)
        try? modelContext.save()
    }

    private func scrollToBottom(proxy: ScrollViewProxy) {
        if isThinking {
            withAnimation { proxy.scrollTo("thinking", anchor: .bottom) }
        } else if let last = conversation.messages.last {
            withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
        }
    }

    private func toolStatusText(_ name: String) -> String {
        switch name {
        case "get_active_plan": return "Looking up your plan..."
        case "get_week_workouts": return "Checking workouts..."
        case "get_workout_details": return "Getting workout details..."
        case "get_running_history": return "Checking running history..."
        case "get_runner_profile": return "Reading your profile..."
        case "update_workout": return "Updating workout..."
        case "swap_workout_dates": return "Swapping dates..."
        case "skip_workout": return "Skipping workout..."
        case "set_week_workouts": return "Creating workouts..."
        default: return "Working..."
        }
    }
}

#Preview {
    CoachingView()
        .environment(PreviewData.appState)
        .modelContainer(PreviewData.container)
}
