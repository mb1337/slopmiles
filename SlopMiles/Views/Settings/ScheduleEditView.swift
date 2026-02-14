import SwiftUI
import SwiftData

struct ScheduleEditView: View {
    @Query private var schedules: [WeeklySchedule]

    var body: some View {
        if let schedule = schedules.first {
            ScheduleEditForm(schedule: schedule)
        } else {
            ProgressView("Loading schedule...")
        }
    }
}

private struct ScheduleEditForm: View {
    var schedule: WeeklySchedule
    @State private var dayWindows: [DayWindow]

    init(schedule: WeeklySchedule) {
        self.schedule = schedule
        _dayWindows = State(initialValue: (1...7).map { day in
            if let window = schedule.timeWindow(for: day) {
                DayWindow(dayOfWeek: day, isAvailable: true, startMinutes: window.startMinutes, endMinutes: window.endMinutes)
            } else {
                DayWindow(dayOfWeek: day, isAvailable: false, startMinutes: 360, endMinutes: 420)
            }
        })
    }

    var body: some View {
        List {
            ForEach($dayWindows) { $day in
                DayScheduleRow(day: $day)
                    .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
            }
        }
        .listStyle(.plain)
        .navigationTitle("Weekly Schedule")
        .onChange(of: dayWindows) { saveSchedule() }
    }

    private func saveSchedule() {
        for day in dayWindows {
            if day.isAvailable {
                schedule.setTimeWindow(for: day.dayOfWeek, start: day.startMinutes, end: day.endMinutes)
            } else {
                schedule.setTimeWindow(for: day.dayOfWeek, start: nil, end: nil)
            }
        }
    }
}

private struct DayWindow: Identifiable, Equatable {
    let dayOfWeek: Int
    var isAvailable: Bool
    var startMinutes: Int
    var endMinutes: Int
    var id: Int { dayOfWeek }

    var startDate: Date {
        Calendar.current.date(from: DateComponents(hour: startMinutes / 60, minute: startMinutes % 60)) ?? Date()
    }
    var endDate: Date {
        Calendar.current.date(from: DateComponents(hour: endMinutes / 60, minute: endMinutes % 60)) ?? Date()
    }
}

private struct DayScheduleRow: View {
    @Binding var day: DayWindow

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Text(DateFormatters.dayName(for: day.dayOfWeek)).font(.subheadline.bold())
                Spacer()
                Toggle("", isOn: $day.isAvailable).labelsHidden()
            }
            if day.isAvailable {
                HStack {
                    DatePicker("Start", selection: Binding(
                        get: { day.startDate },
                        set: { let c = Calendar.current.dateComponents([.hour, .minute], from: $0); day.startMinutes = (c.hour ?? 0) * 60 + (c.minute ?? 0) }
                    ), displayedComponents: .hourAndMinute).labelsHidden()
                    Text("to").foregroundStyle(.secondary)
                    DatePicker("End", selection: Binding(
                        get: { day.endDate },
                        set: { let c = Calendar.current.dateComponents([.hour, .minute], from: $0); day.endMinutes = (c.hour ?? 0) * 60 + (c.minute ?? 0) }
                    ), displayedComponents: .hourAndMinute).labelsHidden()
                    Spacer()
                    Text("\(day.endMinutes - day.startMinutes) min").font(.caption).foregroundStyle(.secondary)
                }
            } else {
                Text("Rest Day").font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding()
        .background(.fill.quaternary, in: RoundedRectangle(cornerRadius: 12))
    }
}
