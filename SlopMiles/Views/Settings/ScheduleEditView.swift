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
        schedule.migrateIfNeeded()
        _dayWindows = State(initialValue: (1...7).map { day in
            let windows = schedule.timeWindows(for: day)
            if windows.isEmpty {
                return DayWindow(dayOfWeek: day, isAvailable: false, slots: [])
            } else {
                let slots = windows.map { SlotWindow(startMinutes: $0.startMinutes, endMinutes: $0.endMinutes) }
                return DayWindow(dayOfWeek: day, isAvailable: true, slots: slots)
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
                let windows = day.slots.map { WeeklySchedule.TimeWindow(startMinutes: $0.startMinutes, endMinutes: $0.endMinutes) }
                schedule.setTimeWindows(for: day.dayOfWeek, windows: windows)
            } else {
                schedule.setTimeWindows(for: day.dayOfWeek, windows: [])
            }
        }
    }
}

#Preview {
    NavigationStack {
        ScheduleEditView()
    }
    .modelContainer(PreviewData.container)
}
