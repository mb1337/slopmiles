import Foundation

enum DateFormatters {
    static func shortDate(from date: Date) -> String {
        date.formatted(date: .abbreviated, time: .omitted)
    }

    static func dayOfWeek(from date: Date) -> String {
        date.formatted(.dateTime.weekday(.wide))
    }

    static func shortDayOfWeek(from date: Date) -> String {
        date.formatted(.dateTime.weekday(.abbreviated))
    }

    static func monthDay(from date: Date) -> String {
        date.formatted(.dateTime.month(.abbreviated).day())
    }

    static func timeOnly(from date: Date) -> String {
        date.formatted(date: .omitted, time: .shortened)
    }

    static func dayName(for dayOfWeek: Int) -> String {
        let symbols = Calendar.current.weekdaySymbols
        guard dayOfWeek >= 1 && dayOfWeek <= 7 else { return "" }
        return symbols[dayOfWeek - 1]
    }

    static func shortDayName(for dayOfWeek: Int) -> String {
        let symbols = Calendar.current.shortWeekdaySymbols
        guard dayOfWeek >= 1 && dayOfWeek <= 7 else { return "" }
        return symbols[dayOfWeek - 1]
    }
}
