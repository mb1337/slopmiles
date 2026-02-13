import SwiftUI
import SwiftData

struct ProfileStepView: View {
    let onContinue: () -> Void
    @Query private var profiles: [UserProfile]
    @Environment(\.modelContext) private var modelContext

    @State private var experienceLevel: ExperienceLevel = .intermediate
    @State private var weeklyMileage: Double = 20
    @State private var unitPreference: UnitPreference = .metric
    @State private var injuryNotes = ""
    @State private var maxHR = ""

    private var profile: UserProfile {
        if let existing = profiles.first { return existing }
        let p = UserProfile()
        modelContext.insert(p)
        return p
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                VStack(spacing: 8) {
                    Text("Runner Profile").font(.title2.bold())
                    Text("Tell us about your running background.")
                        .font(.subheadline).foregroundStyle(.secondary)
                }
                .padding(.top, 32)

                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Experience Level").font(.subheadline.bold())
                        Picker("Experience", selection: $experienceLevel) {
                            ForEach(ExperienceLevel.allCases, id: \.self) { Text($0.displayName).tag($0) }
                        }
                        .pickerStyle(.segmented)
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Preferred Units").font(.subheadline.bold())
                        Picker("Units", selection: $unitPreference) {
                            Text("Metric (km)").tag(UnitPreference.metric)
                            Text("Imperial (mi)").tag(UnitPreference.imperial)
                        }
                        .pickerStyle(.segmented)
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Current Weekly Mileage: \(UnitConverter.formatDistance(weeklyMileage, unit: unitPreference))")
                            .font(.subheadline.bold())
                        Slider(value: $weeklyMileage, in: 0...200, step: 5)
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Max Heart Rate (optional)").font(.subheadline.bold())
                        TextField("e.g., 185", text: $maxHR)
                            .textFieldStyle(.roundedBorder).keyboardType(.numberPad)
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Injury Notes (optional)").font(.subheadline.bold())
                        TextField("Any current injuries or limitations", text: $injuryNotes, axis: .vertical)
                            .textFieldStyle(.roundedBorder).lineLimit(3...5)
                    }
                }
                .padding(.horizontal)

                Spacer(minLength: 32)

                Button("Continue") { saveProfile(); onContinue() }
                    .buttonStyle(.borderedProminent).controlSize(.large).padding(.bottom, 32)
            }
        }
    }

    private func saveProfile() {
        let p = profile
        p.experienceLevel = experienceLevel
        p.currentWeeklyMileageKm = unitPreference == .imperial ? UnitConverter.milesToKm(weeklyMileage) : weeklyMileage
        p.unitPreference = unitPreference
        p.injuryNotes = injuryNotes
        if let hr = Int(maxHR) { p.maxHeartRate = hr }
    }
}
