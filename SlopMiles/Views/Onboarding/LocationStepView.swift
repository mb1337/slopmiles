import SwiftUI

struct LocationStepView: View {
    let onContinue: () -> Void
    @Environment(AppState.self) private var appState
    @ScaledMetric(relativeTo: .largeTitle) private var iconSize: CGFloat = 60

    var body: some View {
        VStack(spacing: 32) {
            Spacer()
            Image(systemName: "location.circle")
                .font(.system(size: iconSize)).foregroundStyle(.blue)
            VStack(spacing: 12) {
                Text("Location").font(.title2.bold())
                Text("Slop Miles can use your location to check weather conditions and adjust your workouts accordingly.")
                    .font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
            VStack(alignment: .leading, spacing: 12) {
                Label("Weather-aware workout scheduling", systemImage: "cloud.sun.fill")
                Label("Indoor/outdoor recommendations", systemImage: "house.and.flag.fill")
                Label("City-level accuracy, low power", systemImage: "battery.100percent")
            }
            .font(.subheadline)
            .padding(.horizontal, 32)
            Spacer()
            VStack(spacing: 12) {
                Button("Allow Location") {
                    Task {
                        await appState.locationService.requestLocationPermission()
                        onContinue()
                    }
                }
                .buttonStyle(.borderedProminent).controlSize(.large)
                Button("Skip for Now", action: onContinue).foregroundStyle(.secondary)
            }
            .padding(.bottom, 32)
        }
        .padding()
    }
}

#Preview {
    LocationStepView(onContinue: {})
        .environment(PreviewData.appState)
}
