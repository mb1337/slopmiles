import SwiftUI
import SwiftData

struct EquipmentStepView: View {
    let onContinue: () -> Void
    @Query private var equipmentList: [RunnerEquipment]
    @Environment(\.modelContext) private var modelContext

    @State private var hasTreadmill = false
    @State private var hasTrack = false
    @State private var hasTrail = false
    @State private var hasGym = false
    @State private var preference: IndoorOutdoorPreference = .preferOutdoor
    @State private var terrainNotes = ""

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                VStack(spacing: 8) {
                    Text("Equipment & Facilities").font(.title2.bold())
                    Text("What do you have access to?").font(.subheadline).foregroundStyle(.secondary)
                }
                .padding(.top, 32)
                VStack(spacing: 12) {
                    EquipmentToggle(icon: "figure.run.treadmill", title: "Treadmill", isOn: $hasTreadmill)
                    EquipmentToggle(icon: "oval", title: "Track", isOn: $hasTrack)
                    EquipmentToggle(icon: "mountain.2.fill", title: "Trails", isOn: $hasTrail)
                    EquipmentToggle(icon: "dumbbell.fill", title: "Gym", isOn: $hasGym)
                }
                .padding(.horizontal)
                VStack(alignment: .leading, spacing: 8) {
                    Text("Indoor/Outdoor Preference").font(.subheadline.bold())
                    Picker("Preference", selection: $preference) {
                        ForEach(IndoorOutdoorPreference.allCases, id: \.self) { Text($0.displayName).tag($0) }
                    }
                    .pickerStyle(.segmented)
                }
                .padding(.horizontal)
                VStack(alignment: .leading, spacing: 8) {
                    Text("Terrain Notes (optional)").font(.subheadline.bold())
                    TextField("e.g., hilly neighborhood, flat bike path nearby", text: $terrainNotes, axis: .vertical)
                        .textFieldStyle(.roundedBorder).lineLimit(2...4)
                }
                .padding(.horizontal)
                Spacer(minLength: 32)
                Button("Continue") { saveEquipment(); onContinue() }
                    .buttonStyle(.borderedProminent).controlSize(.large).padding(.bottom, 32)
            }
        }
    }

    private func saveEquipment() {
        let equipment: RunnerEquipment
        if let existing = equipmentList.first { equipment = existing }
        else { equipment = RunnerEquipment(); modelContext.insert(equipment) }
        equipment.hasTreadmill = hasTreadmill
        equipment.hasTrackAccess = hasTrack
        equipment.hasTrailAccess = hasTrail
        equipment.hasGymAccess = hasGym
        equipment.indoorOutdoorPreference = preference
        equipment.terrainNotes = terrainNotes
    }
}

private struct EquipmentToggle: View {
    let icon: String
    let title: String
    @Binding var isOn: Bool

    var body: some View {
        Toggle(isOn: $isOn) { Label(title, systemImage: icon) }
            .padding()
            .background(.fill.quaternary, in: RoundedRectangle(cornerRadius: 12))
    }
}
