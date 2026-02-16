import Foundation
import SwiftData
import os

private let logger = Logger(subsystem: "com.slopmiles", category: "plangen")

@Observable
@MainActor
final class PlanGenerationManager {
    var isGenerating = false
    var errorMessage: String?
    var completedPlan: TrainingPlan?
    private var generationTask: Task<Void, Never>?

    func startGeneration(
        profile: UserProfile,
        schedule: WeeklySchedule,
        equipment: RunnerEquipment,
        settings: AISettings,
        goalDescription: String,
        raceDistance: Double?,
        raceDate: Date?,
        hasRace: Bool,
        startDate: Date,
        planWeeks: Int,
        aiService: AIService,
        healthKitService: HealthKitService,
        context: ModelContext
    ) {
        guard !isGenerating else { return }
        isGenerating = true
        errorMessage = nil
        completedPlan = nil

        let endDate = hasRace
            ? raceDate!
            : Calendar.current.date(byAdding: .weekOfYear, value: planWeeks, to: startDate)!

        generationTask = Task {
            let stats: RunningStats = healthKitService.isAuthorized
                ? await healthKitService.fetchRunningStats()
                : RunningStats()

            var weatherData: [String: JSONValue]?
            if let lat = profile.homeLatitude, let lon = profile.homeLongitude {
                let forecast = await WeatherTool.getForecast(latitude: lat, longitude: lon, days: 7)
                if forecast["error"] == nil { weatherData = forecast }
            }

            do {
                // Phase 1: Generate outline
                let outlineText = try await aiService.generatePlanOutline(
                    profile: profile, schedule: schedule, equipment: equipment,
                    stats: stats, settings: settings, goalDescription: goalDescription,
                    raceDistance: raceDistance, raceDate: hasRace ? raceDate : nil,
                    startDate: startDate, endDate: endDate,
                    weatherData: weatherData
                )
                let plan = try ResponseParser.parseOutline(
                    from: outlineText, startDate: startDate,
                    endDate: endDate, context: context
                )
                plan.volumeType = profile.volumeType
                plan.goalDescription = goalDescription
                plan.raceDistance = raceDistance
                plan.raceDate = hasRace ? raceDate : nil

                // Phase 2: Generate week 1 workouts immediately
                if let week1 = plan.sortedWeeks.first {
                    let weekText = try await aiService.generateWeekWorkouts(
                        plan: plan, week: week1,
                        profile: profile, schedule: schedule, equipment: equipment,
                        settings: settings, performanceData: WeeklyPerformanceData(),
                        weatherData: weatherData
                    )
                    try ResponseParser.parseWeekWorkouts(
                        from: weekText, week: week1,
                        planStartDate: startDate, context: context
                    )
                }

                TrainingPlan.setActivePlan(plan, in: context)
                try context.save()

                NotificationService.scheduleWeeklyReminder(firstDayOfWeek: profile.firstDayOfWeek)
                _ = await NotificationService.requestAuthorization()

                completedPlan = plan
                logger.info("Plan generation completed successfully")
            } catch is CancellationError {
                // Task was cancelled
            } catch {
                errorMessage = error.localizedDescription
                logger.error("Plan generation failed: \(error.localizedDescription)")
            }
            isGenerating = false
        }
    }

    func cancel(aiService: AIService) {
        aiService.cancelPendingInput()
        generationTask?.cancel()
        generationTask = nil
        isGenerating = false
        errorMessage = nil
    }
}
