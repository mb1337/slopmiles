import SwiftUI

struct HealthKitStepView: View {
    let onContinue: () -> Void
    @Environment(AppState.self) private var appState

    var body: some View {
        VStack(spacing: 32) {
            Spacer()
            Image(systemName: "heart.text.clipboard")
                .font(.system(size: 60)).foregroundStyle(.red)
            VStack(spacing: 12) {
                Text("Health Data").font(.title2.bold())
                Text("Slop Miles can read your running history to create better, more personalized training plans.")
                    .font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
            VStack(alignment: .leading, spacing: 12) {
                Label("Recent running workouts and distances", systemImage: "figure.run")
                Label("Heart rate data and VO2 max", systemImage: "heart.fill")
                Label("Weekly mileage trends", systemImage: "chart.bar.fill")
            }
            .font(.subheadline)
            .padding(.horizontal, 32)
            if let error = appState.healthKitService.authorizationError {
                Text(error).font(.caption).foregroundStyle(.red).padding(.horizontal)
            }
            Spacer()
            VStack(spacing: 12) {
                Button("Allow Health Access") {
                    Task { await appState.healthKitService.requestAuthorization(); onContinue() }
                }
                .buttonStyle(.borderedProminent).controlSize(.large)
                Button("Skip for Now", action: onContinue).foregroundStyle(.secondary)
            }
            .padding(.bottom, 32)
        }
        .padding()
    }
}
