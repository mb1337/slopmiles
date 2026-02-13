import Foundation
import SwiftData

@Model
final class WeeklySchedule {
    var id: UUID = UUID()

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

    init() {
        mondayStartMinutes = 360;    mondayEndMinutes = 420
        tuesdayStartMinutes = 360;   tuesdayEndMinutes = 420
        wednesdayStartMinutes = 360; wednesdayEndMinutes = 420
        thursdayStartMinutes = 360;  thursdayEndMinutes = 420
        fridayStartMinutes = 360;    fridayEndMinutes = 420
        saturdayStartMinutes = 420;  saturdayEndMinutes = 600
        sundayStartMinutes = nil;    sundayEndMinutes = nil
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

    func timeWindow(for dayOfWeek: Int) -> TimeWindow? {
        let (start, end): (Int?, Int?) = switch dayOfWeek {
        case 1: (sundayStartMinutes, sundayEndMinutes)
        case 2: (mondayStartMinutes, mondayEndMinutes)
        case 3: (tuesdayStartMinutes, tuesdayEndMinutes)
        case 4: (wednesdayStartMinutes, wednesdayEndMinutes)
        case 5: (thursdayStartMinutes, thursdayEndMinutes)
        case 6: (fridayStartMinutes, fridayEndMinutes)
        case 7: (saturdayStartMinutes, saturdayEndMinutes)
        default: (nil, nil)
        }
        guard let s = start, let e = end else { return nil }
        return TimeWindow(startMinutes: s, endMinutes: e)
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
        (1...7).filter { timeWindow(for: $0) != nil }
    }

    var restDays: [Int] {
        (1...7).filter { timeWindow(for: $0) == nil }
    }

    func dictionaryForPrompt() -> [JSONValue] {
        let dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        return (1...7).map { day in
            var entry: [String: JSONValue] = ["day": .string(dayNames[day - 1])]
            if let window = timeWindow(for: day) {
                entry["available"] = true
                entry["start"] = .string(window.startTimeFormatted)
                entry["end"] = .string(window.endTimeFormatted)
                entry["duration_minutes"] = .int(window.durationMinutes)
            } else {
                entry["available"] = false
            }
            return JSONValue.object(entry)
        }
    }
}
