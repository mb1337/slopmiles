import SwiftUI
import SwiftData

struct SlotWindow: Identifiable, Equatable {
    let id: UUID
    var startMinutes: Int
    var endMinutes: Int

    init(id: UUID = UUID(), startMinutes: Int, endMinutes: Int) {
        self.id = id
        self.startMinutes = startMinutes
        self.endMinutes = endMinutes
    }

    var startDate: Date {
        Calendar.current.date(from: DateComponents(hour: startMinutes / 60, minute: startMinutes % 60)) ?? Date()
    }
    var endDate: Date {
        Calendar.current.date(from: DateComponents(hour: endMinutes / 60, minute: endMinutes % 60)) ?? Date()
    }
}

struct DayWindow: Identifiable, Equatable {
    let dayOfWeek: Int
    var isAvailable: Bool
    var slots: [SlotWindow]
    var id: Int { dayOfWeek }

    var totalMinutes: Int {
        slots.reduce(0) { $0 + ($1.endMinutes - $1.startMinutes) }
    }
}

struct ScheduleStepView: View {
    let onContinue: () -> Void
    @Query private var schedules: [WeeklySchedule]
    @Environment(\.modelContext) private var modelContext

    @State private var dayWindows: [DayWindow] = (1...7).map { day in
        let defaultSlots: [SlotWindow] = switch day {
        case 2, 3, 4, 5, 6: [SlotWindow(startMinutes: 360, endMinutes: 420)]
        case 7: [SlotWindow(startMinutes: 420, endMinutes: 600)]
        default: []
        }
        return DayWindow(dayOfWeek: day, isAvailable: !defaultSlots.isEmpty, slots: defaultSlots)
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                VStack(spacing: 8) {
                    Text("Weekly Schedule").font(.title2.bold())
                    Text("Set your available time windows for running each day.")
                        .font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
                }
                .padding(.top, 32)

                ForEach($dayWindows) { $day in
                    DayScheduleRow(day: $day)
                }
                .padding(.horizontal)

                Spacer(minLength: 32)

                Button("Continue") { saveSchedule(); onContinue() }
                    .buttonStyle(.borderedProminent).controlSize(.large).padding(.bottom, 32)
            }
        }
    }

    private func saveSchedule() {
        let schedule: WeeklySchedule
        if let existing = schedules.first { schedule = existing }
        else { schedule = WeeklySchedule(); modelContext.insert(schedule) }
        for day in dayWindows {
            if day.isAvailable {
                let windows = day.slots.map { WeeklySchedule.TimeWindow(startMinutes: $0.startMinutes, endMinutes: $0.endMinutes) }
                schedule.setTimeWindows(for: day.dayOfWeek, windows: windows)
            } else {
                schedule.setTimeWindows(for: day.dayOfWeek, windows: [])
            }
        }
    }
}

struct DayScheduleRow: View {
    @Binding var day: DayWindow

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Text(DateFormatters.dayName(for: day.dayOfWeek)).font(.subheadline.bold())
                Spacer()
                Toggle("", isOn: Binding(
                    get: { day.isAvailable },
                    set: { newValue in
                        day.isAvailable = newValue
                        if newValue && day.slots.isEmpty {
                            day.slots = [SlotWindow(startMinutes: 360, endMinutes: 420)]
                        }
                    }
                )).labelsHidden()
                    .accessibilityLabel("\(DateFormatters.dayName(for: day.dayOfWeek)) available")
                    .accessibilityHint(day.isAvailable ? "Currently enabled, double tap to mark as rest day" : "Currently rest day, double tap to enable")
            }
            if day.isAvailable {
                ForEach(day.slots.indices, id: \.self) { index in
                    HStack {
                        DatePicker("Start", selection: Binding(
                            get: { day.slots[index].startDate },
                            set: { let c = Calendar.current.dateComponents([.hour, .minute], from: $0); day.slots[index].startMinutes = (c.hour ?? 0) * 60 + (c.minute ?? 0) }
                        ), displayedComponents: .hourAndMinute).labelsHidden()
                            .accessibilityLabel("\(DateFormatters.dayName(for: day.dayOfWeek)) slot \(index + 1) start time")
                        Text("to").foregroundStyle(.secondary)
                        DatePicker("End", selection: Binding(
                            get: { day.slots[index].endDate },
                            set: { let c = Calendar.current.dateComponents([.hour, .minute], from: $0); day.slots[index].endMinutes = (c.hour ?? 0) * 60 + (c.minute ?? 0) }
                        ), displayedComponents: .hourAndMinute).labelsHidden()
                            .accessibilityLabel("\(DateFormatters.dayName(for: day.dayOfWeek)) slot \(index + 1) end time")
                        Spacer()
                        Text("\(day.slots[index].endMinutes - day.slots[index].startMinutes) min")
                            .font(.caption).foregroundStyle(.secondary)
                        if day.slots.count > 1 {
                            Button { day.slots.remove(at: index) } label: {
                                Image(systemName: "minus.circle.fill").foregroundStyle(.red)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Remove slot \(index + 1)")
                        }
                    }
                }
                HStack {
                    Button {
                        day.slots.append(SlotWindow(startMinutes: 1080, endMinutes: 1200))
                    } label: {
                        Label("Add Time Slot", systemImage: "plus.circle")
                            .font(.caption)
                    }
                    .buttonStyle(.plain).foregroundStyle(.blue)
                    Spacer()
                    if day.slots.count > 1 {
                        Text("\(day.totalMinutes) min total")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
            } else {
                Text("Rest Day").font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding()
        .background(.fill.quaternary, in: RoundedRectangle(cornerRadius: 12))
    }
}
