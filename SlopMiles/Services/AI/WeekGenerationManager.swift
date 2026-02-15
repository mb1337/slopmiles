import Foundation
import SwiftData
import os

private let logger = Logger(subsystem: "com.slopmiles", category: "weekgen")

@Observable
@MainActor
final class WeekGenerationManager {
    enum Status: Sendable {
        case idle
        case generating(weekNumber: Int)
        case failed(String)
    }

    var status: Status = .idle
    private var generationTask: Task<Void, Never>?

    func checkAndGenerateIfNeeded(
        plans: [TrainingPlan],
        profile: UserProfile,
        schedule: WeeklySchedule,
        equipment: RunnerEquipment,
        settings: AISettings,
        aiService: AIService,
        context: ModelContext
    ) {
        guard case .idle = status else { return }

        let now = Date()
        guard let plan = plans.first(where: { $0.endDate >= now }) else { return }

        let firstDayOfWeek = profile.firstDayOfWeek
        guard let currentWeek = findCurrentWeek(in: plan, now: now, firstDayOfWeek: firstDayOfWeek) else { return }
        guard !currentWeek.workoutsGenerated else { return }

        let performanceData = buildPerformanceData(for: plan, upToWeek: currentWeek.weekNumber)

        status = .generating(weekNumber: currentWeek.weekNumber)
        generationTask = Task {
            do {
                let responseText = try await aiService.generateWeekWorkouts(
                    plan: plan, week: currentWeek,
                    profile: profile, schedule: schedule, equipment: equipment,
                    settings: settings, performanceData: performanceData
                )
                try ResponseParser.parseWeekWorkouts(
                    from: responseText, week: currentWeek,
                    planStartDate: plan.startDate, context: context
                )
                currentWeek.workoutsGenerated = true
                try context.save()
                status = .idle
                logger.info("Generated workouts for week \(currentWeek.weekNumber)")
            } catch is CancellationError {
                status = .idle
            } catch {
                status = .failed(error.localizedDescription)
                logger.error("Week generation failed: \(error.localizedDescription)")
            }
        }
    }

    func regenerateWeek(
        week: TrainingWeek,
        plan: TrainingPlan,
        profile: UserProfile,
        schedule: WeeklySchedule,
        equipment: RunnerEquipment,
        settings: AISettings,
        aiService: AIService,
        context: ModelContext
    ) {
        // Delete existing workouts for this week
        for workout in week.sortedWorkouts {
            for step in workout.sortedSteps {
                context.delete(step)
            }
            context.delete(workout)
        }
        week.workoutsGenerated = false

        let performanceData = buildPerformanceData(for: plan, upToWeek: week.weekNumber)

        status = .generating(weekNumber: week.weekNumber)
        generationTask = Task {
            do {
                let responseText = try await aiService.generateWeekWorkouts(
                    plan: plan, week: week,
                    profile: profile, schedule: schedule, equipment: equipment,
                    settings: settings, performanceData: performanceData
                )
                try ResponseParser.parseWeekWorkouts(
                    from: responseText, week: week,
                    planStartDate: plan.startDate, context: context
                )
                week.workoutsGenerated = true
                try context.save()
                status = .idle
                logger.info("Regenerated workouts for week \(week.weekNumber)")
            } catch is CancellationError {
                status = .idle
            } catch {
                status = .failed(error.localizedDescription)
                logger.error("Week regeneration failed: \(error.localizedDescription)")
            }
        }
    }

    func retry(
        week: TrainingWeek,
        plan: TrainingPlan,
        profile: UserProfile,
        schedule: WeeklySchedule,
        equipment: RunnerEquipment,
        settings: AISettings,
        aiService: AIService,
        context: ModelContext
    ) {
        status = .idle
        regenerateWeek(
            week: week, plan: plan,
            profile: profile, schedule: schedule, equipment: equipment,
            settings: settings, aiService: aiService, context: context
        )
    }

    func cancel() {
        generationTask?.cancel()
        generationTask = nil
        status = .idle
    }

    // MARK: - Week Boundary Calculation

    func findCurrentWeek(in plan: TrainingPlan, now: Date, firstDayOfWeek: Int) -> TrainingWeek? {
        let calendar = Calendar.current
        let planStart = calendar.startOfDay(for: plan.startDate)

        // Calculate the start of the plan's first week based on firstDayOfWeek
        var adjustedCalendar = calendar
        adjustedCalendar.firstWeekday = firstDayOfWeek

        for week in plan.sortedWeeks {
            let weekOffset = week.weekNumber - 1
            guard let weekStart = adjustedCalendar.date(byAdding: .weekOfYear, value: weekOffset, to: planStart) else { continue }
            guard let weekEnd = adjustedCalendar.date(byAdding: .weekOfYear, value: 1, to: weekStart) else { continue }

            if now >= weekStart && now < weekEnd {
                return week
            }
        }

        return nil
    }

    // MARK: - Performance Data

    private func buildPerformanceData(for plan: TrainingPlan, upToWeek weekNumber: Int) -> WeeklyPerformanceData {
        var data = WeeklyPerformanceData()

        for week in plan.sortedWeeks where week.weekNumber < weekNumber && week.workoutsGenerated {
            let workouts = week.sortedWorkouts.filter { $0.workoutType != .rest }
            let completed = workouts.filter { $0.completionStatus == .completed }.count
            let skipped = workouts.filter { $0.completionStatus == .skipped }.count

            data.priorWeekSummaries.append(.init(
                weekNumber: week.weekNumber,
                theme: week.theme,
                plannedDistanceKm: week.totalDistanceKm,
                plannedDurationMinutes: week.totalDurationMinutes,
                completedWorkouts: completed,
                totalWorkouts: workouts.count,
                skippedWorkouts: skipped
            ))
        }

        return data
    }
}
