import Foundation
import UserNotifications

struct NotificationService {
    private static let weeklyReminderIdentifier = "weekly-workout-generation"

    static func requestAuthorization() async -> Bool {
        do {
            return try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound])
        } catch {
            return false
        }
    }

    static func scheduleWeeklyReminder(firstDayOfWeek: Int) {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [weeklyReminderIdentifier])

        let content = UNMutableNotificationContent()
        content.title = "Your next week of training is ready"
        content.body = "Open Slop Miles to generate this week's workouts"
        content.sound = .default

        // Notification fires the day before the first day of the week at 8:00 AM
        let notificationWeekday: Int
        if firstDayOfWeek == 1 {
            notificationWeekday = 7 // Saturday
        } else {
            notificationWeekday = firstDayOfWeek - 1
        }

        var dateComponents = DateComponents()
        dateComponents.weekday = notificationWeekday
        dateComponents.hour = 8

        let trigger = UNCalendarNotificationTrigger(dateMatching: dateComponents, repeats: true)
        let request = UNNotificationRequest(identifier: weeklyReminderIdentifier, content: content, trigger: trigger)

        center.add(request) { error in
            if let error {
                print("Failed to schedule weekly reminder: \(error.localizedDescription)")
            }
        }
    }

    static func cancelWeeklyReminder() {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [weeklyReminderIdentifier])
    }
}
