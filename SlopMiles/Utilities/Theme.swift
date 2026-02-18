import SwiftUI

enum Theme {
    // MARK: - Brand Colors

    static let accent = Color.teal
    static let accentGradient = LinearGradient(
        colors: [.teal, .blue],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    // MARK: - Card Styling

    static let cardRadius: CGFloat = 16

    // MARK: - Workout Type Colors

    static func workoutColor(_ type: WorkoutType) -> Color {
        switch type {
        case .easy: return .green
        case .tempo: return .orange
        case .interval: return .red
        case .long: return .blue
        case .recovery: return .mint
        case .race: return .purple
        case .rest: return .secondary
        }
    }
}

// MARK: - Appearance Mode

enum AppearanceMode: String, CaseIterable {
    case system, light, dark

    var displayName: String {
        rawValue.capitalized
    }

    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }
}

// MARK: - Card Background Modifier

extension View {
    func themedCard() -> some View {
        self
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: Theme.cardRadius))
            .shadow(color: .black.opacity(0.06), radius: 8, y: 4)
    }
}
