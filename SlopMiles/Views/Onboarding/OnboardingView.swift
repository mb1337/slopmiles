import SwiftUI
import SwiftData

struct OnboardingView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.modelContext) private var modelContext
    @Query private var aiSettings: [AISettings]
    @State private var currentStep = 0

    private let totalSteps = 7

    var body: some View {
        VStack(spacing: 0) {
            ProgressView(value: Double(currentStep), total: Double(totalSteps - 1))
                .padding(.horizontal)
                .padding(.top, 8)

            TabView(selection: $currentStep) {
                WelcomeStepView(onContinue: nextStep)
                    .tag(0)
                APIKeyStepView(onContinue: nextStep)
                    .tag(1)
                HealthKitStepView(onContinue: nextStep)
                    .tag(2)
                ProfileStepView(onContinue: nextStep)
                    .tag(3)
                ScheduleStepView(onContinue: nextStep)
                    .tag(4)
                EquipmentStepView(onContinue: nextStep)
                    .tag(5)
                WorkoutKitStepView(onComplete: completeOnboarding)
                    .tag(6)
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .animation(.easeInOut, value: currentStep)
        }
    }

    private func nextStep() {
        if currentStep < totalSteps - 1 {
            currentStep += 1
        }
    }

    private func completeOnboarding() {
        if let settings = aiSettings.first {
            settings.hasCompletedOnboarding = true
        }
    }
}
