import SwiftUI
import SwiftData

struct ScheduleStepView: View {
    let onContinue: () -> Void
    @Query private var schedules: [WeeklySchedule]
    @Environment(\.modelContext) private var modelContext

    @State private var dayWindows: [DayWindow] = (1...7).map { day in
        let defaults: (Int?, Int?) = switch day {
        case 2, 3, 4, 5, 6: (360, 420)
        case 7: (420, 600)
        default: (nil, nil)
        }
        return DayWindow(dayOfWeek: day, isAvailable: defaults.0 != nil, startMinutes: defaults.0 ?? 360, endMinutes: defaults.1 ?? 420)
    }

    struct DayWindow: Identifiable {
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
                schedule.setTimeWindow(for: day.dayOfWeek, start: day.startMinutes, end: day.endMinutes)
            } else {
                schedule.setTimeWindow(for: day.dayOfWeek, start: nil, end: nil)
            }
        }
    }
}

private struct DayScheduleRow: View {
    @Binding var day: ScheduleStepView.DayWindow

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Text(DateFormatters.dayName(for: day.dayOfWeek)).font(.subheadline.bold())
                Spacer()
                Toggle("", isOn: $day.isAvailable).labelsHidden()
                    .accessibilityLabel("\(DateFormatters.dayName(for: day.dayOfWeek)) available")
                    .accessibilityHint(day.isAvailable ? "Currently enabled, double tap to mark as rest day" : "Currently rest day, double tap to enable")
            }
            if day.isAvailable {
                HStack {
                    DatePicker("Start", selection: Binding(
                        get: { day.startDate },
                        set: { let c = Calendar.current.dateComponents([.hour, .minute], from: $0); day.startMinutes = (c.hour ?? 0) * 60 + (c.minute ?? 0) }
                    ), displayedComponents: .hourAndMinute).labelsHidden()
                        .accessibilityLabel("\(DateFormatters.dayName(for: day.dayOfWeek)) start time")
                    Text("to").foregroundStyle(.secondary)
                    DatePicker("End", selection: Binding(
                        get: { day.endDate },
                        set: { let c = Calendar.current.dateComponents([.hour, .minute], from: $0); day.endMinutes = (c.hour ?? 0) * 60 + (c.minute ?? 0) }
                    ), displayedComponents: .hourAndMinute).labelsHidden()
                        .accessibilityLabel("\(DateFormatters.dayName(for: day.dayOfWeek)) end time")
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
