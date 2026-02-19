import Foundation
import SwiftData
import os

private let logger = Logger(subsystem: "com.slopmiles", category: "coaching-tools")

@MainActor
final class CoachingToolExecutor {

    func execute(
        _ toolCall: ToolCall,
        context: ModelContext,
        healthKitService: HealthKitService,
        workoutKitService: WorkoutKitService,
        calendarService: CalendarService
    ) async -> (id: String, result: String) {
        logger.info("Executing tool: \(toolCall.name, privacy: .public)")
        do {
            let result: String
            switch toolCall.name {
            case "get_active_plan":
                result = try getActivePlan(context: context)
            case "get_week_workouts":
                result = try getWeekWorkouts(args: toolCall.arguments, context: context)
            case "get_workout_details":
                result = try getWorkoutDetails(args: toolCall.arguments, context: context)
            case "get_running_history":
                result = await getRunningHistory(args: toolCall.arguments, healthKitService: healthKitService)
            case "get_runner_profile":
                result = try getRunnerProfile(context: context)
            case "update_workout":
                result = try updateWorkout(args: toolCall.arguments, context: context, calendarService: calendarService)
            case "swap_workout_dates":
                result = try swapWorkoutDates(args: toolCall.arguments, context: context, calendarService: calendarService)
            case "skip_workout":
                result = try skipWorkout(args: toolCall.arguments, context: context, calendarService: calendarService)
            case "set_week_workouts":
                result = try await setWeekWorkouts(args: toolCall.arguments, context: context, workoutKitService: workoutKitService, calendarService: calendarService)
            default:
                result = "{\"error\": \"Unknown tool: \(toolCall.name)\"}"
            }
            return (toolCall.id, result)
        } catch {
            logger.error("Tool \(toolCall.name) failed: \(error.localizedDescription)")
            return (toolCall.id, "{\"error\": \"\(error.localizedDescription)\"}")
        }
    }

    // MARK: - Read Tools

    private func getActivePlan(context: ModelContext) throws -> String {
        let descriptor = FetchDescriptor<TrainingPlan>(predicate: #Predicate { $0.isActive })
        guard let plan = try context.fetch(descriptor).first else {
            return "{\"error\": \"No active training plan found\"}"
        }

        let profileDescriptor = FetchDescriptor<UserProfile>()
        let profile = try context.fetch(profileDescriptor).first
        let firstDayOfWeek = profile?.firstDayOfWeek ?? Calendar.current.firstWeekday

        let currentWeekNumber = findCurrentWeekNumber(in: plan, firstDayOfWeek: firstDayOfWeek)

        let dateFormatter = ISO8601DateFormatter()
        dateFormatter.formatOptions = [.withFullDate]

        var result: [String: Any] = [
            "name": plan.name,
            "goal": plan.goalDescription,
            "total_weeks": plan.totalWeeks,
            "start_date": dateFormatter.string(from: plan.startDate),
            "end_date": dateFormatter.string(from: plan.endDate),
            "volume_type": plan.volumeType.rawValue,
        ]
        if let vdot = plan.cachedVDOT {
            result["vdot"] = vdot
        }
        if let raceDistance = plan.raceDistance {
            result["race_distance_meters"] = raceDistance
        }
        if let raceDate = plan.raceDate {
            result["race_date"] = dateFormatter.string(from: raceDate)
        }
        if let weekNum = currentWeekNumber {
            result["current_week_number"] = weekNum
        }

        // Include week summaries
        var weekSummaries: [[String: Any]] = []
        for week in plan.sortedWeeks {
            var summary: [String: Any] = [
                "week_number": week.weekNumber,
                "theme": week.theme,
                "weekly_volume_percent": week.weeklyVolumePercent,
                "workouts_generated": week.workoutsGenerated,
            ]
            if week.workoutsGenerated {
                let workouts = week.sortedWorkouts.filter { $0.workoutType != .rest }
                let completed = workouts.filter { $0.completionStatus == .completed }.count
                summary["completed_workouts"] = completed
                summary["total_workouts"] = workouts.count
            }
            weekSummaries.append(summary)
        }
        result["weeks"] = weekSummaries

        return jsonString(result)
    }

    private func getWeekWorkouts(args: [String: JSONValue], context: ModelContext) throws -> String {
        guard let weekNumber = args["week_number"]?.intValue else {
            return "{\"error\": \"week_number is required\"}"
        }

        let plan = try fetchActivePlan(context: context)
        guard let week = plan.sortedWeeks.first(where: { $0.weekNumber == weekNumber }) else {
            return "{\"error\": \"Week \(weekNumber) not found\"}"
        }

        guard week.workoutsGenerated else {
            return "{\"week_number\": \(weekNumber), \"workouts_generated\": false, \"workouts\": []}"
        }

        let dateFormatter = ISO8601DateFormatter()
        dateFormatter.formatOptions = [.withFullDate]

        let profile = try context.fetch(FetchDescriptor<UserProfile>()).first
        let volumeType = profile?.volumeType ?? .distance

        var workouts: [[String: Any]] = []
        for workout in week.sortedWorkouts {
            var w: [String: Any] = [
                "id": workout.id.uuidString,
                "name": workout.name,
                "type": workout.workoutType.rawValue,
                "date": dateFormatter.string(from: workout.scheduledDate),
                "completion_status": workout.completionStatus.rawValue,
            ]
            if volumeType == .time {
                w["duration_minutes"] = round(workout.durationMinutes * 10) / 10
            } else {
                w["distance_km"] = round(workout.distanceKm * 100) / 100
            }
            if let pace = workout.targetPaceMinPerKm {
                w["target_pace_min_per_km"] = round(pace * 100) / 100
            }
            w["intensity"] = workout.intensityRaw

            if workout.isLinkedToHealthKit {
                w["actual_distance_km"] = round(workout.actualDistanceKm * 100) / 100
                w["actual_duration_minutes"] = round(workout.actualDurationMinutes * 10) / 10
                if let actualPace = workout.actualPaceMinPerKm {
                    w["actual_pace_min_per_km"] = round(actualPace * 100) / 100
                }
            }

            if !workout.notes.isEmpty {
                w["notes"] = workout.notes
            }

            workouts.append(w)
        }

        let result: [String: Any] = [
            "week_number": weekNumber,
            "theme": week.theme,
            "weekly_volume_percent": week.weeklyVolumePercent,
            "workouts_generated": true,
            "workouts": workouts,
        ]

        return jsonString(result)
    }

    private func getWorkoutDetails(args: [String: JSONValue], context: ModelContext) throws -> String {
        guard let idStr = args["workout_id"]?.stringValue,
              let workoutId = UUID(uuidString: idStr) else {
            return "{\"error\": \"workout_id is required and must be a valid UUID\"}"
        }

        let descriptor = FetchDescriptor<PlannedWorkout>(predicate: #Predicate { $0.id == workoutId })
        guard let workout = try context.fetch(descriptor).first else {
            return "{\"error\": \"Workout not found\"}"
        }

        let dateFormatter = ISO8601DateFormatter()
        dateFormatter.formatOptions = [.withFullDate]

        var result: [String: Any] = [
            "id": workout.id.uuidString,
            "name": workout.name,
            "type": workout.workoutType.rawValue,
            "date": dateFormatter.string(from: workout.scheduledDate),
            "distance_km": round(workout.distanceKm * 100) / 100,
            "duration_minutes": round(workout.durationMinutes * 10) / 10,
            "daily_volume_percent": workout.dailyVolumePercent,
            "intensity": workout.intensityRaw,
            "location": workout.location.rawValue,
            "completion_status": workout.completionStatus.rawValue,
        ]

        if let pace = workout.targetPaceMinPerKm {
            result["target_pace_min_per_km"] = round(pace * 100) / 100
        }
        if !workout.notes.isEmpty {
            result["notes"] = workout.notes
        }

        // Steps
        var steps: [[String: Any]] = []
        for step in workout.sortedSteps {
            var s: [String: Any] = [
                "type": step.stepType.rawValue,
                "name": step.name,
                "goal_type": step.goalType.rawValue,
                "intensity": step.intensityRaw,
                "repeat_count": step.repeatCount,
                "group_id": step.groupId,
            ]
            if let goalValue = step.goalValue {
                s["goal_value"] = goalValue
            }
            if let pace = step.targetPaceMinPerKm {
                s["target_pace_min_per_km"] = round(pace * 100) / 100
            }
            if let hrZone = step.hrZone {
                s["hr_zone"] = hrZone
            }
            steps.append(s)
        }
        result["steps"] = steps

        // Linked HealthKit data
        if workout.isLinkedToHealthKit {
            result["actual_distance_km"] = round(workout.actualDistanceKm * 100) / 100
            result["actual_duration_minutes"] = round(workout.actualDurationMinutes * 10) / 10
            if let actualPace = workout.actualPaceMinPerKm {
                result["actual_pace_min_per_km"] = round(actualPace * 100) / 100
            }
            result["linked_workouts"] = workout.linkedWorkouts.map { entry in
                [
                    "healthkit_id": entry.healthKitWorkoutID,
                    "distance_km": round(entry.distanceKm * 100) / 100,
                    "duration_minutes": round(entry.durationMinutes * 10) / 10,
                ] as [String: Any]
            }
        }

        return jsonString(result)
    }

    private func getRunningHistory(args: [String: JSONValue], healthKitService: HealthKitService) async -> String {
        let stats = await healthKitService.fetchRunningStats()

        var result: [String: Any] = [
            "total_runs_last_30_days": stats.totalRunsLast30Days,
            "average_weekly_distance_km": round(stats.averageWeeklyDistanceKm * 10) / 10,
            "average_pace_min_per_km": round(stats.averagePaceMinPerKm * 100) / 100,
            "longest_run_km": round(stats.longestRunKm * 10) / 10,
            "weekly_distances_last_8_weeks_km": stats.weeklyDistancesKm.map { round($0 * 10) / 10 },
        ]
        if let hr = stats.averageHeartRate {
            result["average_heart_rate"] = Int(hr)
        }
        if let vo2 = stats.estimatedVO2Max {
            result["estimated_vo2max"] = round(vo2 * 10) / 10
        }

        return jsonString(result)
    }

    private func getRunnerProfile(context: ModelContext) throws -> String {
        let profile = try context.fetch(FetchDescriptor<UserProfile>()).first ?? UserProfile()
        let schedule = try context.fetch(FetchDescriptor<WeeklySchedule>()).first ?? WeeklySchedule()
        let equipment = try context.fetch(FetchDescriptor<RunnerEquipment>()).first ?? RunnerEquipment()

        var result: [String: Any] = [
            "experience_level": profile.experienceLevel.rawValue,
            "unit_preference": profile.unitPreference.rawValue,
            "volume_type": profile.volumeType.rawValue,
        ]

        if profile.volumeType == .time {
            result["peak_weekly_volume_minutes"] = Int(profile.peakWeeklyVolumeMinutes)
        } else {
            result["peak_weekly_mileage_km"] = round(profile.peakWeeklyMileageKm * 10) / 10
        }

        if let vdot = profile.vdot {
            result["vdot"] = round(vdot * 10) / 10
        }
        if let maxHR = profile.maxHeartRate {
            result["max_heart_rate"] = maxHR
        }
        if let restingHR = profile.restingHeartRate {
            result["resting_heart_rate"] = restingHR
        }
        if let lthr = profile.lactateThresholdHR {
            result["lactate_threshold_hr"] = lthr
        }
        if !profile.injuryNotes.isEmpty {
            result["injury_notes"] = profile.injuryNotes
        }

        // Schedule summary
        let dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        var scheduleSummary: [[String: Any]] = []
        for day in 1...7 {
            let windows = schedule.timeWindows(for: day)
            var daySummary: [String: Any] = ["day": dayNames[day - 1]]
            if windows.isEmpty {
                daySummary["available"] = false
            } else {
                daySummary["available"] = true
                daySummary["total_duration_minutes"] = schedule.totalDuration(for: day)
                daySummary["slots"] = windows.count
            }
            scheduleSummary.append(daySummary)
        }
        result["weekly_schedule"] = scheduleSummary

        // Equipment
        var equip: [String: Any] = [
            "treadmill": equipment.hasTreadmill,
            "track_access": equipment.hasTrackAccess,
            "trail_access": equipment.hasTrailAccess,
            "preference": equipment.indoorOutdoorPreference.rawValue,
        ]
        if !equipment.terrainNotes.isEmpty {
            equip["terrain_notes"] = equipment.terrainNotes
        }
        result["equipment"] = equip

        return jsonString(result)
    }

    // MARK: - Write Tools

    private func updateWorkout(args: [String: JSONValue], context: ModelContext, calendarService: CalendarService) throws -> String {
        guard let idStr = args["workout_id"]?.stringValue,
              let workoutId = UUID(uuidString: idStr) else {
            return "{\"error\": \"workout_id is required and must be a valid UUID\"}"
        }

        let descriptor = FetchDescriptor<PlannedWorkout>(predicate: #Predicate { $0.id == workoutId })
        guard let workout = try context.fetch(descriptor).first else {
            return "{\"error\": \"Workout not found\"}"
        }

        // Fetch VDOT for pace recalculation
        let profile = try context.fetch(FetchDescriptor<UserProfile>()).first
        let vdot = profile?.vdot

        if let name = args["name"]?.stringValue {
            workout.name = name
        }
        if let distanceKm = args["distance_km"]?.doubleValue {
            workout.distanceKm = distanceKm
        }
        if let durationMinutes = args["duration_minutes"]?.doubleValue {
            workout.durationMinutes = durationMinutes
        }
        if let intensityStr = args["intensity"]?.stringValue {
            let mapped = intensityStr == "repeat" ? "repetition" : intensityStr
            workout.intensityTarget = .named(WorkoutIntensity(rawValue: mapped) ?? .easy)
            if let v = vdot {
                workout.targetPaceMinPerKm = PaceCalculator.pace(for: workout.intensityTarget, vdot: v)
            }
        }
        if let typeStr = args["workout_type"]?.stringValue {
            workout.workoutType = WorkoutType(rawValue: typeStr) ?? workout.workoutType
        }
        if let notes = args["notes"]?.stringValue {
            workout.notes = notes
        }

        try? context.save()
        calendarService.syncWorkout(workout)

        let dateFormatter = ISO8601DateFormatter()
        dateFormatter.formatOptions = [.withFullDate]

        let result: [String: Any] = [
            "status": "updated",
            "workout": [
                "id": workout.id.uuidString,
                "name": workout.name,
                "type": workout.workoutType.rawValue,
                "date": dateFormatter.string(from: workout.scheduledDate),
                "distance_km": round(workout.distanceKm * 100) / 100,
                "duration_minutes": round(workout.durationMinutes * 10) / 10,
                "intensity": workout.intensityRaw,
            ] as [String: Any],
        ]

        return jsonString(result)
    }

    private func swapWorkoutDates(args: [String: JSONValue], context: ModelContext, calendarService: CalendarService) throws -> String {
        guard let idStrA = args["workout_id_a"]?.stringValue,
              let idA = UUID(uuidString: idStrA),
              let idStrB = args["workout_id_b"]?.stringValue,
              let idB = UUID(uuidString: idStrB) else {
            return "{\"error\": \"workout_id_a and workout_id_b are required and must be valid UUIDs\"}"
        }

        let descA = FetchDescriptor<PlannedWorkout>(predicate: #Predicate { $0.id == idA })
        let descB = FetchDescriptor<PlannedWorkout>(predicate: #Predicate { $0.id == idB })

        guard let workoutA = try context.fetch(descA).first,
              let workoutB = try context.fetch(descB).first else {
            return "{\"error\": \"One or both workouts not found\"}"
        }

        let tempDate = workoutA.scheduledDate
        workoutA.scheduledDate = workoutB.scheduledDate
        workoutB.scheduledDate = tempDate

        try? context.save()
        calendarService.syncWorkout(workoutA)
        calendarService.syncWorkout(workoutB)

        let dateFormatter = ISO8601DateFormatter()
        dateFormatter.formatOptions = [.withFullDate]

        let result: [String: Any] = [
            "status": "swapped",
            "workout_a": ["id": workoutA.id.uuidString, "name": workoutA.name, "new_date": dateFormatter.string(from: workoutA.scheduledDate)],
            "workout_b": ["id": workoutB.id.uuidString, "name": workoutB.name, "new_date": dateFormatter.string(from: workoutB.scheduledDate)],
        ]

        return jsonString(result)
    }

    private func skipWorkout(args: [String: JSONValue], context: ModelContext, calendarService: CalendarService) throws -> String {
        guard let idStr = args["workout_id"]?.stringValue,
              let workoutId = UUID(uuidString: idStr) else {
            return "{\"error\": \"workout_id is required and must be a valid UUID\"}"
        }

        let descriptor = FetchDescriptor<PlannedWorkout>(predicate: #Predicate { $0.id == workoutId })
        guard let workout = try context.fetch(descriptor).first else {
            return "{\"error\": \"Workout not found\"}"
        }

        workout.completionStatus = .skipped
        if let reason = args["reason"]?.stringValue {
            workout.notes = reason
        }

        try? context.save()
        calendarService.removeWorkoutEvent(workout)

        return jsonString([
            "status": "skipped",
            "workout_id": workout.id.uuidString,
            "name": workout.name,
        ] as [String: Any])
    }

    private func setWeekWorkouts(args: [String: JSONValue], context: ModelContext, workoutKitService: WorkoutKitService, calendarService: CalendarService) async throws -> String {
        guard let weekNumber = args["week_number"]?.intValue else {
            return "{\"error\": \"week_number is required\"}"
        }
        guard let workoutsJSON = args["workouts_json"]?.stringValue else {
            return "{\"error\": \"workouts_json is required\"}"
        }

        let plan = try fetchActivePlan(context: context)
        guard let week = plan.sortedWeeks.first(where: { $0.weekNumber == weekNumber }) else {
            return "{\"error\": \"Week \(weekNumber) not found in active plan\"}"
        }

        // Delete existing workouts for this week
        for workout in week.sortedWorkouts {
            for step in workout.sortedSteps {
                context.delete(step)
            }
            context.delete(workout)
        }

        // Build parse context
        let profile = try context.fetch(FetchDescriptor<UserProfile>()).first ?? UserProfile()
        let schedule = try context.fetch(FetchDescriptor<WeeklySchedule>()).first

        let parseContext = PlanParseContext(
            peakVolume: profile.volumeType == .time ? profile.peakWeeklyVolumeMinutes : profile.peakWeeklyMileageKm,
            volumeType: profile.volumeType,
            vdot: profile.vdot,
            schedule: schedule
        )

        // Parse the workouts JSON
        try ResponseParser.parseWeekWorkouts(
            from: workoutsJSON,
            week: week,
            planStartDate: plan.startDate,
            context: context,
            parseContext: parseContext
        )

        week.workoutsGenerated = true
        try context.save()

        // Schedule to Watch
        do {
            try await workoutKitService.scheduleWeek(week)
        } catch {
            logger.error("Watch scheduling failed: \(error.localizedDescription)")
        }

        // Sync to calendar
        calendarService.syncWeek(week, schedule: schedule)

        // Build confirmation response
        let workouts = week.sortedWorkouts
        let workoutSummaries = workouts.map { w in
            "\(w.name) (\(w.workoutType.rawValue)) - \(DateFormatters.shortDayOfWeek(from: w.scheduledDate))"
        }

        let result: [String: Any] = [
            "status": "created",
            "week_number": weekNumber,
            "workouts_count": workouts.count,
            "workout_summaries": workoutSummaries,
        ]

        return jsonString(result)
    }

    // MARK: - Helpers

    private func fetchActivePlan(context: ModelContext) throws -> TrainingPlan {
        let descriptor = FetchDescriptor<TrainingPlan>(predicate: #Predicate { $0.isActive })
        guard let plan = try context.fetch(descriptor).first else {
            throw CoachingToolError.noPlan
        }
        return plan
    }

    private func findCurrentWeekNumber(in plan: TrainingPlan, firstDayOfWeek: Int) -> Int? {
        let calendar = Calendar.current
        let now = Date()
        let planStart = calendar.startOfDay(for: plan.startDate)

        var adjustedCalendar = calendar
        adjustedCalendar.firstWeekday = firstDayOfWeek

        for week in plan.sortedWeeks {
            let weekOffset = week.weekNumber - 1
            guard let weekStart = adjustedCalendar.date(byAdding: .weekOfYear, value: weekOffset, to: planStart),
                  let weekEnd = adjustedCalendar.date(byAdding: .weekOfYear, value: 1, to: weekStart) else { continue }
            if now >= weekStart && now < weekEnd {
                return week.weekNumber
            }
        }
        return nil
    }

    private func jsonString(_ value: Any) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]),
              let str = String(data: data, encoding: .utf8) else {
            return "{\"error\": \"Failed to serialize result\"}"
        }
        return str
    }
}

enum CoachingToolError: Error, LocalizedError {
    case noPlan

    var errorDescription: String? {
        switch self {
        case .noPlan: return "No active training plan found"
        }
    }
}
