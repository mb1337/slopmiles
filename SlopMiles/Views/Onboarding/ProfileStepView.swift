import SwiftUI
import SwiftData

struct ProfileStepView: View {
    let onContinue: () -> Void
    @Query private var profiles: [UserProfile]
    @Environment(AppState.self) private var appState

    @State private var experienceLevel: ExperienceLevel = .intermediate
    @State private var weeklyMileageText: String = "20"
    @State private var unitPreference: UnitPreference = .metric
    @State private var volumeType: VolumeType = .distance
    @State private var weeklyVolumeMinutesText: String = "150"
    @State private var injuryNotes = ""
    @State private var maxHR = ""
    @State private var restingHR = ""
    @State private var showVDOTCalculator = false

    /// Read-only access to the singleton UserProfile seeded at app launch.
    private var profile: UserProfile? {
        profiles.first
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
                        Text("Track Volume By").font(.subheadline.bold())
                        Picker("Volume Type", selection: $volumeType) {
                            ForEach(VolumeType.allCases, id: \.self) { Text($0.displayName).tag($0) }
                        }
                        .pickerStyle(.segmented)
                    }

                    if volumeType == .time {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Peak Weekly Volume (minutes)").font(.subheadline.bold())
                            TextField("e.g., 200", text: $weeklyVolumeMinutesText)
                                .textFieldStyle(.roundedBorder).keyboardType(.numberPad)
                        }
                    } else {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Peak Weekly Mileage (\(unitPreference.distanceLabel))").font(.subheadline.bold())
                            TextField("e.g., 30", text: $weeklyMileageText)
                                .textFieldStyle(.roundedBorder).keyboardType(.numberPad)
                        }
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Max Heart Rate (optional)").font(.subheadline.bold())
                        TextField("e.g., 185", text: $maxHR)
                            .textFieldStyle(.roundedBorder).keyboardType(.numberPad)
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Resting Heart Rate (optional)").font(.subheadline.bold())
                        TextField("e.g., 55", text: $restingHR)
                            .textFieldStyle(.roundedBorder).keyboardType(.numberPad)
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("VDOT (optional)").font(.subheadline.bold())
                        HStack {
                            if let vdot = profile?.vdot {
                                Text(String(format: "%.1f", vdot))
                                    .foregroundStyle(.secondary)
                            } else {
                                Text("Not set")
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Button("Calculate from Race") {
                                showVDOTCalculator = true
                            }
                            .font(.subheadline)
                        }
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
        .task { await autoFillFromHealthKit() }
        .sheet(isPresented: $showVDOTCalculator) {
            if let profile {
                VDOTCalculatorSheet(profile: profile)
            }
        }
    }

    private func autoFillFromHealthKit() async {
        guard appState.healthKitService.isAuthorized else { return }
        let hk = appState.healthKitService
        if maxHR.isEmpty, let estimated = await hk.fetchEstimatedMaxHeartRate() {
            maxHR = "\(estimated)"
        }
        if restingHR.isEmpty, let resting = await hk.fetchRestingHeartRate() {
            restingHR = "\(resting)"
        }
        if weeklyMileageText == "20" || weeklyMileageText.isEmpty {
            if let avgKm = await hk.fetchAverageWeeklyDistance() {
                let display = unitPreference == .imperial ? UnitConverter.kmToMiles(avgKm) : avgKm
                weeklyMileageText = "\(Int(display.rounded()))"
            }
        }
    }

    private func saveProfile() {
        guard let p = profile else { return }
        p.experienceLevel = experienceLevel
        p.volumeType = volumeType
        if volumeType == .time {
            p.peakWeeklyVolumeMinutes = Double(weeklyVolumeMinutesText) ?? 0
        } else {
            let mileage = Double(weeklyMileageText) ?? 0
            p.peakWeeklyMileageKm = unitPreference == .imperial ? UnitConverter.milesToKm(mileage) : mileage
        }
        p.unitPreference = unitPreference
        p.injuryNotes = injuryNotes
        if let hr = Int(maxHR) { p.maxHeartRate = hr }
        if let rhr = Int(restingHR) { p.restingHeartRate = rhr }
    }
}
