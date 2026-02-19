import EventKit
import Foundation
import os

private let logger = Logger(subsystem: "com.slopmiles", category: "calendar")

@Observable
@MainActor
final class CalendarService {
    var isAuthorized = false
    var authorizationError: String?

    private var eventStore = EKEventStore()
    private let calendarTitle = "Slop Miles"
    private let calendarIdentifierKey = "slopMilesCalendarIdentifier"

    func checkAuthorizationStatus() {
        let status = EKEventStore.authorizationStatus(for: .event)
        isAuthorized = status == .fullAccess
        if isAuthorized {
            eventStore = EKEventStore()
        }
    }

    func requestAuthorization() async {
        do {
            let granted = try await eventStore.requestFullAccessToEvents()
            isAuthorized = granted
            if granted {
                // Reinitialize so the store sees calendar sources after permission grant
                eventStore = EKEventStore()
            } else {
                authorizationError = "Calendar access denied. Enable in Settings > Privacy > Calendars."
            }
        } catch {
            isAuthorized = false
            authorizationError = error.localizedDescription
            logger.error("Calendar authorization failed: \(error.localizedDescription)")
        }
    }

    // MARK: - Calendar Management

    private func findOrCreateCalendar() -> EKCalendar? {
        // Check stored identifier first
        if let identifier = UserDefaults.standard.string(forKey: calendarIdentifierKey),
           let calendar = eventStore.calendar(withIdentifier: identifier) {
            return calendar
        }

        // Search by title
        let calendars = eventStore.calendars(for: .event)
        if let existing = calendars.first(where: { $0.title == calendarTitle }) {
            UserDefaults.standard.set(existing.calendarIdentifier, forKey: calendarIdentifierKey)
            return existing
        }

        // Create new calendar
        let calendar = EKCalendar(for: .event, eventStore: eventStore)
        calendar.title = calendarTitle

        // Prefer iCloud source, fall back to default calendar's source
        let sources = eventStore.sources
        if let iCloudSource = sources.first(where: { $0.sourceType == .calDAV }) {
            calendar.source = iCloudSource
        } else if let defaultSource = eventStore.defaultCalendarForNewEvents?.source {
            calendar.source = defaultSource
        } else if let localSource = sources.first(where: { $0.sourceType == .local }) {
            calendar.source = localSource
        } else {
            logger.error("No calendar sources available")
            return nil
        }

        do {
            try eventStore.saveCalendar(calendar, commit: true)
            UserDefaults.standard.set(calendar.calendarIdentifier, forKey: calendarIdentifierKey)
            logger.info("Created Slop Miles calendar")
            return calendar
        } catch {
            logger.error("Failed to create calendar: \(error.localizedDescription)")
            return nil
        }
    }

    // MARK: - Sync

    func syncWorkout(_ workout: PlannedWorkout, schedule: WeeklySchedule? = nil) {
        guard isAuthorized else { return }
        guard workout.workoutType != .rest else { return }
        guard let calendar = findOrCreateCalendar() else { return }

        let event: EKEvent
        let existingEventStartDate: Date?
        if let existingID = workout.calendarEventID,
           let existing = eventStore.event(withIdentifier: existingID) {
            event = existing
            existingEventStartDate = existing.startDate
        } else {
            event = EKEvent(eventStore: eventStore)
            event.calendar = calendar
            existingEventStartDate = nil
        }

        event.title = workout.name.isEmpty ? workout.workoutType.displayName : workout.name

        let startDate = resolvedStartDate(
            for: workout,
            schedule: schedule,
            existingEventStartDate: existingEventStartDate
        )

        event.startDate = startDate

        // Duration
        let durationMinutes: Double
        if workout.durationMinutes > 0 {
            durationMinutes = workout.durationMinutes
        } else if workout.distanceKm > 0, let pace = workout.targetPaceMinPerKm, pace > 0 {
            durationMinutes = workout.distanceKm * pace
        } else if workout.distanceKm > 0 {
            // Rough estimate: ~6 min/km
            durationMinutes = workout.distanceKm * 6
        } else {
            durationMinutes = 30
        }
        event.endDate = startDate.addingTimeInterval(durationMinutes * 60)

        // Notes
        var noteLines: [String] = []
        if workout.distanceKm > 0 {
            noteLines.append(String(format: "Distance: %.1f km", workout.distanceKm))
        }
        if let pace = workout.targetPaceMinPerKm, pace > 0 {
            let mins = Int(pace)
            let secs = Int((pace - Double(mins)) * 60)
            noteLines.append(String(format: "Target pace: %d:%02d /km", mins, secs))
        }
        if workout.durationMinutes > 0 {
            noteLines.append(String(format: "Duration: %.0f min", workout.durationMinutes))
        }
        let steps = workout.sortedSteps
        if !steps.isEmpty {
            noteLines.append("")
            noteLines.append("Steps:")
            for step in steps {
                noteLines.append("  \(step.name)")
            }
        }
        if !workout.notes.isEmpty {
            noteLines.append("")
            noteLines.append(workout.notes)
        }
        event.notes = noteLines.joined(separator: "\n")

        // Location
        switch workout.location {
        case .outdoor: event.location = "Outdoor"
        case .treadmill: event.location = "Treadmill"
        case .track: event.location = "Track"
        case .trail: event.location = "Trail"
        }

        do {
            try eventStore.save(event, span: .thisEvent)
            workout.calendarEventID = event.eventIdentifier
        } catch {
            logger.error("Failed to save calendar event: \(error.localizedDescription)")
        }
    }

    func resolvedStartDate(
        for workout: PlannedWorkout,
        schedule: WeeklySchedule? = nil,
        existingEventStartDate: Date? = nil,
        calendar: Calendar = .current
    ) -> Date {
        let dayOfWeek = calendar.component(.weekday, from: workout.scheduledDate)
        if let schedule, let window = schedule.timeWindows(for: dayOfWeek).first {
            let hour = window.startMinutes / 60
            let minute = window.startMinutes % 60
            if let adjusted = calendar.date(bySettingHour: hour, minute: minute, second: 0, of: workout.scheduledDate) {
                return adjusted
            }
        }

        if let existingEventStartDate {
            let time = calendar.dateComponents([.hour, .minute], from: existingEventStartDate)
            if let hour = time.hour, let minute = time.minute,
               let adjusted = calendar.date(bySettingHour: hour, minute: minute, second: 0, of: workout.scheduledDate) {
                return adjusted
            }
        }

        if hasExplicitClockTime(workout.scheduledDate, calendar: calendar) {
            return workout.scheduledDate
        }

        return calendar.date(bySettingHour: 7, minute: 0, second: 0, of: workout.scheduledDate) ?? workout.scheduledDate
    }

    private func hasExplicitClockTime(_ date: Date, calendar: Calendar) -> Bool {
        let components = calendar.dateComponents([.hour, .minute, .second], from: date)
        return (components.hour ?? 0) != 0 || (components.minute ?? 0) != 0 || (components.second ?? 0) != 0
    }

    func syncWeek(_ week: TrainingWeek, schedule: WeeklySchedule? = nil) {
        guard isAuthorized else { return }
        for workout in week.sortedWorkouts where workout.workoutType != .rest {
            syncWorkout(workout, schedule: schedule)
        }
    }

    func removeWorkoutEvent(_ workout: PlannedWorkout) {
        guard isAuthorized else { return }
        guard let eventID = workout.calendarEventID,
              let event = eventStore.event(withIdentifier: eventID) else { return }
        do {
            try eventStore.remove(event, span: .thisEvent)
            workout.calendarEventID = nil
        } catch {
            logger.error("Failed to remove calendar event: \(error.localizedDescription)")
        }
    }

    func removeWeekEvents(_ week: TrainingWeek) {
        guard isAuthorized else { return }
        for workout in week.sortedWorkouts {
            removeWorkoutEvent(workout)
        }
    }
}
