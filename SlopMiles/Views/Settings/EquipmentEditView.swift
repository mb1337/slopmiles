import SwiftUI
import SwiftData

struct EquipmentEditView: View {
    @Query private var equipmentList: [RunnerEquipment]

    var body: some View {
        if let equipment = equipmentList.first {
            EquipmentEditForm(equipment: equipment)
        } else {
            ProgressView("Loading equipment...")
        }
    }
}

private struct EquipmentEditForm: View {
    @Bindable var equipment: RunnerEquipment

    var body: some View {
        Form {
            Section("Access") {
                Toggle(isOn: $equipment.hasTreadmill) { Label("Treadmill", systemImage: "figure.run.treadmill") }
                Toggle(isOn: $equipment.hasTrackAccess) { Label("Track", systemImage: "oval") }
                Toggle(isOn: $equipment.hasTrailAccess) { Label("Trails", systemImage: "mountain.2.fill") }
                Toggle(isOn: $equipment.hasGymAccess) { Label("Gym", systemImage: "dumbbell.fill") }
            }

            Section("Indoor/Outdoor Preference") {
                Picker("Preference", selection: Binding(
                    get: { equipment.indoorOutdoorPreference },
                    set: { equipment.indoorOutdoorPreference = $0 }
                )) {
                    ForEach(IndoorOutdoorPreference.allCases, id: \.self) { Text($0.displayName).tag($0) }
                }
                .pickerStyle(.segmented)
            }

            Section("Terrain Notes") {
                TextField("e.g., hilly neighborhood, flat bike path nearby", text: $equipment.terrainNotes, axis: .vertical)
                    .lineLimit(2...4)
            }
        }
        .navigationTitle("Equipment & Facilities")
    }
}
