import SwiftUI

struct WelcomeStepView: View {
    let onContinue: () -> Void
    @ScaledMetric(relativeTo: .largeTitle) private var iconSize: CGFloat = 80

    var body: some View {
        VStack(spacing: 32) {
            Spacer()
            Image(systemName: "figure.run.circle.fill")
                .font(.system(size: iconSize))
                .foregroundStyle(.blue)
            VStack(spacing: 12) {
                Text("Slop Miles")
                    .font(.largeTitle.bold())
                Text("Your AI Running Coach")
                    .font(.title3)
                    .foregroundStyle(.secondary)
            }
            VStack(alignment: .leading, spacing: 16) {
                FeatureRow(icon: "brain", title: "AI-Powered Plans", description: "Personalized training built by AI using proven running science")
                FeatureRow(icon: "applewatch", title: "Apple Watch", description: "Structured workouts pushed directly to your Watch")
                FeatureRow(icon: "chart.line.uptrend.xyaxis", title: "Smart Progression", description: "Safe mileage increases validated by deterministic calculators")
                FeatureRow(icon: "key.fill", title: "Your API Key", description: "Bring your own OpenAI or Anthropic key. Data stays on-device.")
            }
            .padding(.horizontal, 24)
            Spacer()
            Button("Get Started", action: onContinue)
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .padding(.bottom, 32)
        }
        .padding()
    }
}

private struct FeatureRow: View {
    let icon: String
    let title: String
    let description: String

    var body: some View {
        HStack(spacing: 16) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundStyle(.blue)
                .frame(width: 32)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.bold())
                Text(description).font(.caption).foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

#Preview {
    WelcomeStepView(onContinue: {})
}
