import Foundation
import SwiftData

@Model
final class WeeklySchedule {
    var id: UUID = UUID()

    // MARK: - Legacy single-slot properties (kept for migration)
    var mondayStartMinutes: Int?
    var mondayEndMinutes: Int?
    var tuesdayStartMinutes: Int?
    var tuesdayEndMinutes: Int?
    var wednesdayStartMinutes: Int?
    var wednesdayEndMinutes: Int?
    var thursdayStartMinutes: Int?
    var thursdayEndMinutes: Int?
    var fridayStartMinutes: Int?
    var fridayEndMinutes: Int?
    var saturdayStartMinutes: Int?
    var saturdayEndMinutes: Int?
    var sundayStartMinutes: Int?
    var sundayEndMinutes: Int?

    // MARK: - Multi-slot storage
    var slotsJSON: String = "{}"

    struct Slot: Codable, Equatable {
        var startMinutes: Int
        var endMinutes: Int
    }

    struct TimeWindow {
        let startMinutes: Int
        let endMinutes: Int

        var durationMinutes: Int { endMinutes - startMinutes }

        var startTimeFormatted: String {
            let hours = startMinutes / 60
            let mins = startMinutes % 60
            return String(format: "%d:%02d %@", hours > 12 ? hours - 12 : (hours == 0 ? 12 : hours), mins, hours >= 12 ? "PM" : "AM")
        }

        var endTimeFormatted: String {
            let hours = endMinutes / 60
            let mins = endMinutes % 60
            return String(format: "%d:%02d %@", hours > 12 ? hours - 12 : (hours == 0 ? 12 : hours), mins, hours >= 12 ? "PM" : "AM")
        }
    }

    init() {
        mondayStartMinutes = 360;    mondayEndMinutes = 420
        tuesdayStartMinutes = 360;   tuesdayEndMinutes = 420
        wednesdayStartMinutes = 360; wednesdayEndMinutes = 420
        thursdayStartMinutes = 360;  thursdayEndMinutes = 420
        fridayStartMinutes = 360;    fridayEndMinutes = 420
        saturdayStartMinutes = 420;  saturdayEndMinutes = 600
        sundayStartMinutes = nil;    sundayEndMinutes = nil

        // Encode defaults into slotsJSON
        let defaults: [String: [Slot]] = [
            "2": [Slot(startMinutes: 360, endMinutes: 420)],
            "3": [Slot(startMinutes: 360, endMinutes: 420)],
            "4": [Slot(startMinutes: 360, endMinutes: 420)],
            "5": [Slot(startMinutes: 360, endMinutes: 420)],
            "6": [Slot(startMinutes: 360, endMinutes: 420)],
            "7": [Slot(startMinutes: 420, endMinutes: 600)],
        ]
        if let data = try? JSONEncoder().encode(defaults) {
            slotsJSON = String(data: data, encoding: .utf8) ?? "{}"
        }
    }

    // MARK: - Slots access

    private func decodedSlots() -> [String: [Slot]] {
        guard let data = slotsJSON.data(using: .utf8),
              let slots = try? JSONDecoder().decode([String: [Slot]].self, from: data) else {
            return [:]
        }
        return slots
    }

    private func encodeSlots(_ slots: [String: [Slot]]) {
        if let data = try? JSONEncoder().encode(slots) {
            slotsJSON = String(data: data, encoding: .utf8) ?? "{}"
        }
    }

    // MARK: - Multi-slot accessors

    func timeWindows(for dayOfWeek: Int) -> [TimeWindow] {
        let slots = decodedSlots()
        guard let daySlots = slots[String(dayOfWeek)] else { return [] }
        return daySlots.map { TimeWindow(startMinutes: $0.startMinutes, endMinutes: $0.endMinutes) }
    }

    func setTimeWindows(for dayOfWeek: Int, windows: [TimeWindow]) {
        var slots = decodedSlots()
        if windows.isEmpty {
            slots.removeValue(forKey: String(dayOfWeek))
        } else {
            slots[String(dayOfWeek)] = windows.map { Slot(startMinutes: $0.startMinutes, endMinutes: $0.endMinutes) }
        }
        encodeSlots(slots)

        // Keep legacy properties in sync
        let first = windows.first
        setTimeWindow(for: dayOfWeek, start: first?.startMinutes, end: first?.endMinutes)
    }

    func totalDuration(for dayOfWeek: Int) -> Int {
        timeWindows(for: dayOfWeek).reduce(0) { $0 + $1.durationMinutes }
    }

    // MARK: - Single-slot backward compatibility

    func timeWindow(for dayOfWeek: Int) -> TimeWindow? {
        let windows = timeWindows(for: dayOfWeek)
        guard !windows.isEmpty else { return nil }
        // Return the longest slot for backward compatibility
        return windows.max(by: { $0.durationMinutes < $1.durationMinutes })
    }

    func setTimeWindow(for dayOfWeek: Int, start: Int?, end: Int?) {
        switch dayOfWeek {
        case 1: sundayStartMinutes = start; sundayEndMinutes = end
        case 2: mondayStartMinutes = start; mondayEndMinutes = end
        case 3: tuesdayStartMinutes = start; tuesdayEndMinutes = end
        case 4: wednesdayStartMinutes = start; wednesdayEndMinutes = end
        case 5: thursdayStartMinutes = start; thursdayEndMinutes = end
        case 6: fridayStartMinutes = start; fridayEndMinutes = end
        case 7: saturdayStartMinutes = start; saturdayEndMinutes = end
        default: break
        }
    }

    var availableDays: [Int] {
        (1...7).filter { !timeWindows(for: $0).isEmpty }
    }

    var restDays: [Int] {
        (1...7).filter { timeWindows(for: $0).isEmpty }
    }

    // MARK: - Migration

    func migrateIfNeeded() {
        // If slotsJSON already has data, no migration needed
        let existing = decodedSlots()
        if !existing.isEmpty { return }

        // Migrate from legacy single-slot properties
        var slots: [String: [Slot]] = [:]
        for day in 1...7 {
            let (start, end): (Int?, Int?) = switch day {
            case 1: (sundayStartMinutes, sundayEndMinutes)
            case 2: (mondayStartMinutes, mondayEndMinutes)
            case 3: (tuesdayStartMinutes, tuesdayEndMinutes)
            case 4: (wednesdayStartMinutes, wednesdayEndMinutes)
            case 5: (thursdayStartMinutes, thursdayEndMinutes)
            case 6: (fridayStartMinutes, fridayEndMinutes)
            case 7: (saturdayStartMinutes, saturdayEndMinutes)
            default: (nil, nil)
            }
            if let s = start, let e = end {
                slots[String(day)] = [Slot(startMinutes: s, endMinutes: e)]
            }
        }
        encodeSlots(slots)
    }

    // MARK: - Prompt output

    func dictionaryForPrompt() -> [JSONValue] {
        let dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        return (1...7).map { day in
            var entry: [String: JSONValue] = ["day": .string(dayNames[day - 1])]
            let windows = timeWindows(for: day)
            if windows.isEmpty {
                entry["available"] = false
            } else {
                entry["available"] = true
                let timeSlots: [JSONValue] = windows.map { window in
                    .object([
                        "start": .string(window.startTimeFormatted),
                        "end": .string(window.endTimeFormatted),
                        "duration_minutes": .int(window.durationMinutes)
                    ])
                }
                entry["time_slots"] = .array(timeSlots)
                entry["total_duration_minutes"] = .int(totalDuration(for: day))
            }
            return JSONValue.object(entry)
        }
    }
}
