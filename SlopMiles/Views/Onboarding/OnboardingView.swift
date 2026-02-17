import SwiftUI
import SwiftData

struct OnboardingView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.modelContext) private var modelContext
    @Query private var aiSettings: [AISettings]
    @State private var currentStep = 0

    private let totalSteps = 8

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button {
                    previousStep()
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.body.weight(.semibold))
                }
                .opacity(currentStep > 0 ? 1 : 0)
                .disabled(currentStep == 0)

                Spacer()
            }
            .padding(.horizontal)
            .padding(.top, 8)

            ProgressView(value: Double(currentStep), total: Double(totalSteps))
                .padding(.horizontal)
                .padding(.top, 4)

            Group {
                switch currentStep {
                case 0: WelcomeStepView(onContinue: nextStep)
                case 1: APIKeyStepView(onContinue: nextStep)
                case 2: HealthKitStepView(onContinue: nextStep)
                case 3: LocationStepView(onContinue: nextStep)
                case 4: ProfileStepView(onContinue: nextStep)
                case 5: ScheduleStepView(onContinue: nextStep)
                case 6: EquipmentStepView(onContinue: nextStep)
                case 7: WorkoutKitStepView(onComplete: completeOnboarding)
                default: EmptyView()
                }
            }
            .animation(.easeInOut, value: currentStep)
        }
    }

    private func previousStep() {
        if currentStep > 0 {
            currentStep -= 1
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
