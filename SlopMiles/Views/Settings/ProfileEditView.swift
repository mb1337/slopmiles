import SwiftUI
import SwiftData

struct ProfileEditView: View {
    @Query private var profiles: [UserProfile]

    var body: some View {
        if let profile = profiles.first {
            ProfileEditForm(profile: profile)
        } else {
            ProgressView("Loading profile...")
        }
    }
}

private struct ProfileEditForm: View {
    @Bindable var profile: UserProfile

    @State private var weeklyMileageText: String
    @State private var weeklyVolumeMinutesText: String
    @State private var maxHRText: String
    @State private var restingHRText: String
    @State private var ltHRText: String

    init(profile: UserProfile) {
        self.profile = profile
        let displayMileage = profile.unitPreference == .imperial
            ? UnitConverter.kmToMiles(profile.currentWeeklyMileageKm)
            : profile.currentWeeklyMileageKm
        _weeklyMileageText = State(initialValue: displayMileage > 0 ? "\(Int(displayMileage))" : "")
        _weeklyVolumeMinutesText = State(initialValue: profile.currentWeeklyVolumeMinutes > 0 ? "\(Int(profile.currentWeeklyVolumeMinutes))" : "")
        _maxHRText = State(initialValue: profile.maxHeartRate.map(String.init) ?? "")
        _restingHRText = State(initialValue: profile.restingHeartRate.map(String.init) ?? "")
        _ltHRText = State(initialValue: profile.lactateThresholdHR.map(String.init) ?? "")
    }

    var body: some View {
        Form {
            Section("Experience") {
                Picker("Experience Level", selection: Binding(
                    get: { profile.experienceLevel },
                    set: { profile.experienceLevel = $0 }
                )) {
                    ForEach(ExperienceLevel.allCases, id: \.self) { Text($0.displayName).tag($0) }
                }
                .pickerStyle(.segmented)
            }

            Section("Units") {
                Picker("Preferred Units", selection: Binding(
                    get: { profile.unitPreference },
                    set: { newUnit in
                        let oldUnit = profile.unitPreference
                        profile.unitPreference = newUnit
                        // Convert the displayed value to the new unit
                        if let current = Double(weeklyMileageText) {
                            let converted: Double
                            if oldUnit == .metric && newUnit == .imperial {
                                converted = UnitConverter.kmToMiles(current)
                            } else if oldUnit == .imperial && newUnit == .metric {
                                converted = UnitConverter.milesToKm(current)
                            } else {
                                converted = current
                            }
                            weeklyMileageText = "\(Int(converted.rounded()))"
                        }
                    }
                )) {
                    Text("Metric (km)").tag(UnitPreference.metric)
                    Text("Imperial (mi)").tag(UnitPreference.imperial)
                }
                .pickerStyle(.segmented)
            }

            Section("Volume Tracking") {
                Picker("Track Volume By", selection: Binding(
                    get: { profile.volumeType },
                    set: { profile.volumeType = $0 }
                )) {
                    ForEach(VolumeType.allCases, id: \.self) { Text($0.displayName).tag($0) }
                }
                .pickerStyle(.segmented)
            }

            if profile.volumeType == .time {
                Section("Weekly Volume (minutes)") {
                    HStack {
                        Text("Minutes per week")
                        Spacer()
                        TextField("e.g., 200", text: $weeklyVolumeMinutesText)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 80)
                            .onChange(of: weeklyVolumeMinutesText) {
                                profile.currentWeeklyVolumeMinutes = Double(weeklyVolumeMinutesText) ?? 0
                            }
                    }
                }
            } else {
                Section("Weekly Mileage (\(profile.unitPreference.distanceLabel))") {
                    HStack {
                        Text("\(profile.unitPreference == .metric ? "Kilometers" : "Miles") per week")
                        Spacer()
                        TextField("e.g., 30", text: $weeklyMileageText)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 80)
                            .onChange(of: weeklyMileageText) {
                                let value = Double(weeklyMileageText) ?? 0
                                profile.currentWeeklyMileageKm = profile.unitPreference == .imperial
                                    ? UnitConverter.milesToKm(value)
                                    : value
                            }
                    }
                }
            }

            Section("Heart Rate") {
                HStack {
                    Text("Max HR")
                    Spacer()
                    TextField("e.g., 185", text: $maxHRText)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.trailing)
                        .frame(width: 80)
                        .onChange(of: maxHRText) { profile.maxHeartRate = Int(maxHRText) }
                }
                HStack {
                    Text("Resting HR")
                    Spacer()
                    TextField("e.g., 55", text: $restingHRText)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.trailing)
                        .frame(width: 80)
                        .onChange(of: restingHRText) { profile.restingHeartRate = Int(restingHRText) }
                }
                HStack {
                    Text("Lactate Threshold HR")
                    Spacer()
                    TextField("e.g., 165", text: $ltHRText)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.trailing)
                        .frame(width: 80)
                        .onChange(of: ltHRText) { profile.lactateThresholdHR = Int(ltHRText) }
                }
            }

            Section("Injury Notes") {
                TextField("Any current injuries or limitations", text: Binding(
                    get: { profile.injuryNotes },
                    set: { profile.injuryNotes = $0 }
                ), axis: .vertical)
                .lineLimit(3...5)
            }
        }
        .navigationTitle("Runner Profile")
    }
}
