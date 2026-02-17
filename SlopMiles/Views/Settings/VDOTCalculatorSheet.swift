import SwiftUI
import HealthKit
import VDotCalculator

struct VDOTCalculatorSheet: View {
    @Bindable var profile: UserProfile
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    enum CalculatorTab: String, CaseIterable {
        case manual = "Manual Entry"
        case workout = "From Workout"
    }

    @State private var selectedTab: CalculatorTab = .manual

    // Manual entry state
    @State private var selectedDistance: RaceDistance = .fiveK
    @State private var hoursText = ""
    @State private var minutesText = ""
    @State private var secondsText = ""
    @State private var calculatedVDOT: Double?

    // Workout state
    @State private var recentWorkouts: [HKWorkout] = []
    @State private var selectedWorkout: HKWorkout?
    @State private var workoutVDOT: Double?
    @State private var isLoadingWorkouts = false

    var body: some View {
        NavigationStack {
            Form {
                Picker("Method", selection: $selectedTab) {
                    ForEach(CalculatorTab.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
                .padding(.horizontal)

                switch selectedTab {
                case .manual:
                    manualEntrySection
                case .workout:
                    workoutSection
                }
            }
            .navigationTitle("Calculate VDOT")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .task {
                if appState.healthKitService.isAuthorized {
                    await loadRecentWorkouts()
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    // MARK: - Manual Entry

    @ViewBuilder
    private var manualEntrySection: some View {
        Section("Race Distance") {
            Picker("Distance", selection: $selectedDistance) {
                ForEach(RaceDistance.allCases, id: \.self) { Text($0.displayName).tag($0) }
            }
        }

        Section("Race Time") {
            HStack {
                VStack {
                    TextField("H", text: $hoursText)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.center)
                        .frame(width: 50)
                        .accessibilityLabel("Hours")
                    Text("hours").font(.caption2).foregroundStyle(.secondary)
                }
                Text(":").font(.title3).accessibilityHidden(true)
                VStack {
                    TextField("MM", text: $minutesText)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.center)
                        .frame(width: 50)
                        .accessibilityLabel("Minutes")
                    Text("min").font(.caption2).foregroundStyle(.secondary)
                }
                Text(":").font(.title3).accessibilityHidden(true)
                VStack {
                    TextField("SS", text: $secondsText)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.center)
                        .frame(width: 50)
                        .accessibilityLabel("Seconds")
                        .onChange(of: secondsText) {
                            if let val = Int(secondsText), val > 59 {
                                secondsText = "59"
                            }
                        }
                    Text("sec").font(.caption2).foregroundStyle(.secondary)
                }
            }
        }

        Section {
            Button("Calculate") { calculateManualVDOT() }
                .disabled(!isManualInputValid)

            if let vdot = calculatedVDOT {
                HStack {
                    Text("VDOT")
                        .font(.headline)
                    Spacer()
                    Text(String(format: "%.1f", vdot))
                        .font(.title2.bold())
                        .foregroundStyle(.blue)
                }

                Button("Save VDOT") {
                    profile.vdot = vdot
                    dismiss()
                }
                .buttonStyle(.borderedProminent)
            }
        }
    }

    // MARK: - Workout Selection

    @ViewBuilder
    private var workoutSection: some View {
        if !appState.healthKitService.isAuthorized {
            Section {
                Text("HealthKit access is required to load workouts.")
                    .foregroundStyle(.secondary)
            }
        } else if isLoadingWorkouts {
            Section {
                ProgressView("Loading workouts...")
            }
        } else if recentWorkouts.isEmpty {
            Section {
                Text("No running workouts found in the last 90 days.")
                    .foregroundStyle(.secondary)
            }
        } else {
            Section("Recent Workouts") {
                ForEach(recentWorkouts, id: \.uuid) { workout in
                    Button {
                        selectWorkout(workout)
                    } label: {
                        workoutRow(workout)
                    }
                    .tint(.primary)
                }
            }

            if let vdot = workoutVDOT, let workout = selectedWorkout {
                Section("Result") {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Based on \(formatWorkoutSummary(workout))")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        HStack {
                            Text("VDOT")
                                .font(.headline)
                            Spacer()
                            Text(String(format: "%.1f", vdot))
                                .font(.title2.bold())
                                .foregroundStyle(.blue)
                        }
                    }

                    Button("Save VDOT") {
                        profile.vdot = vdot
                        dismiss()
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
        }
    }

    // MARK: - Helpers

    private var isManualInputValid: Bool {
        let hours = Int(hoursText) ?? 0
        let minutes = Int(minutesText) ?? 0
        let seconds = Int(secondsText) ?? 0
        return (hours + minutes + seconds) > 0
    }

    private func calculateManualVDOT() {
        let hours = Double(Int(hoursText) ?? 0)
        let minutes = Double(Int(minutesText) ?? 0)
        let seconds = Double(Int(secondsText) ?? 0)
        let totalSeconds = hours * 3600 + minutes * 60 + seconds
        guard totalSeconds > 0 else { return }

        let distance = Measurement<UnitLength>(value: selectedDistance.meters, unit: .meters)
        let vdot = Vdot(raceDistance: distance, raceTime: totalSeconds)
        calculatedVDOT = round(vdot.value * 10) / 10
    }

    private func loadRecentWorkouts() async {
        isLoadingWorkouts = true
        let ninetyDaysAgo = Calendar.current.date(byAdding: .day, value: -90, to: Date()) ?? Date()
        recentWorkouts = await appState.healthKitService.fetchRunningWorkouts(from: ninetyDaysAgo, to: Date())
        isLoadingWorkouts = false
    }

    private func selectWorkout(_ workout: HKWorkout) {
        selectedWorkout = workout
        guard let distance = workout.totalDistance?.doubleValue(for: .meter()),
              distance > 0 else {
            workoutVDOT = nil
            return
        }
        let dist = Measurement<UnitLength>(value: distance, unit: .meters)
        let vdot = Vdot(raceDistance: dist, raceTime: workout.duration)
        workoutVDOT = round(vdot.value * 10) / 10
    }

    private func workoutRow(_ workout: HKWorkout) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(workout.startDate, style: .date)
                .font(.subheadline.bold())
            HStack(spacing: 12) {
                if let distance = workout.totalDistance?.doubleValue(for: .meterUnit(with: .kilo)) {
                    let displayDistance = profile.unitPreference == .imperial
                        ? UnitConverter.kmToMiles(distance) : distance
                    Text(String(format: "%.1f %@", displayDistance, profile.unitPreference.distanceLabel))
                }
                Text(formatDuration(workout.duration))
                if let distance = workout.totalDistance?.doubleValue(for: .meterUnit(with: .kilo)),
                   distance > 0 {
                    let paceMinPerKm = (workout.duration / 60.0) / distance
                    Text(UnitConverter.formatPace(paceMinPerKm, unit: profile.unitPreference))
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }

    private func formatWorkoutSummary(_ workout: HKWorkout) -> String {
        guard let distance = workout.totalDistance?.doubleValue(for: .meterUnit(with: .kilo)) else {
            return "workout"
        }
        let displayDistance = profile.unitPreference == .imperial
            ? UnitConverter.kmToMiles(distance) : distance
        return String(format: "%.1f %@ in %@",
                      displayDistance,
                      profile.unitPreference.distanceLabel,
                      formatDuration(workout.duration))
    }

    private func formatDuration(_ seconds: TimeInterval) -> String {
        let total = Int(seconds)
        let h = total / 3600
        let m = (total % 3600) / 60
        let s = total % 60
        if h > 0 {
            return String(format: "%d:%02d:%02d", h, m, s)
        }
        return String(format: "%d:%02d", m, s)
    }
}

// MARK: - Race Distance

enum RaceDistance: String, CaseIterable {
    case m1500 = "1500m"
    case mile = "Mile"
    case threeK = "3K"
    case fiveK = "5K"
    case tenK = "10K"
    case fifteenK = "15K"
    case halfMarathon = "Half Marathon"
    case marathon = "Marathon"

    var displayName: String { rawValue }

    var meters: Double {
        switch self {
        case .m1500: return 1500
        case .mile: return 1609.344
        case .threeK: return 3000
        case .fiveK: return 5000
        case .tenK: return 10000
        case .fifteenK: return 15000
        case .halfMarathon: return 21097.5
        case .marathon: return 42195
        }
    }
}

#Preview {
    VDOTCalculatorSheet(profile: PreviewData.sampleProfile)
        .environment(PreviewData.appState)
        .modelContainer(PreviewData.container)
}
