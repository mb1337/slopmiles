import SwiftUI

struct WorkoutKitStepView: View {
    let onComplete: () -> Void
    @Environment(AppState.self) private var appState

    var body: some View {
        VStack(spacing: 32) {
            Spacer()
            Image(systemName: "applewatch.and.arrow.forward")
                .font(.system(size: 60)).foregroundStyle(.green)
            VStack(spacing: 12) {
                Text("Apple Watch").font(.title2.bold())
                Text("Push structured workouts directly to your Apple Watch Workout app.")
                    .font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
            VStack(alignment: .leading, spacing: 12) {
                Label("Interval workouts with pace targets", systemImage: "figure.run")
                Label("Scheduled workouts on your watch", systemImage: "calendar.badge.clock")
                Label("Heart rate zone alerts", systemImage: "heart.fill")
            }
            .font(.subheadline)
            .padding(.horizontal, 32)
            Spacer()
            VStack(spacing: 12) {
                Button("Enable Watch Workouts") {
                    Task { await appState.workoutKitService.requestAuthorization(); onComplete() }
                }
                .buttonStyle(.borderedProminent).controlSize(.large)
                Button("Skip for Now", action: onComplete).foregroundStyle(.secondary)
            }
            .padding(.bottom, 32)
        }
        .padding()
    }
}
