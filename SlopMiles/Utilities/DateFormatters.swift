import Foundation

enum DateFormatters {
    static let shortDate: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .none
        return f
    }()

    static let dayOfWeek: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "EEEE"
        return f
    }()

    static let shortDayOfWeek: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "EEE"
        return f
    }()

    static let monthDay: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "MMM d"
        return f
    }()

    static let timeOnly: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .none
        f.timeStyle = .short
        return f
    }()

    static func dayName(for dayOfWeek: Int) -> String {
        let names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        guard dayOfWeek >= 1 && dayOfWeek <= 7 else { return "" }
        return names[dayOfWeek - 1]
    }

    static func shortDayName(for dayOfWeek: Int) -> String {
        let names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
        guard dayOfWeek >= 1 && dayOfWeek <= 7 else { return "" }
        return names[dayOfWeek - 1]
    }
}
