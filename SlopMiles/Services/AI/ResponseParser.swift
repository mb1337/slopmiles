import Foundation
import SwiftData

struct PlanParseContext {
    let peakVolume: Double      // km or minutes depending on volumeType
    let volumeType: VolumeType
    let vdot: Double?
}

struct ResponseParser {
    enum ParseError: Error, LocalizedError {
        case noJSON(responsePreview: String)
        case invalidJSON(String)
        case missingField(String)

        var errorDescription: String? {
            switch self {
            case .noJSON(let preview): return "No JSON found in AI response: \(preview)"
            case .invalidJSON(let msg): return "Invalid JSON: \(msg)"
            case .missingField(let field): return "Missing required field: \(field)"
            }
        }
    }

    static func parsePlan(from responseText: String, startDate: Date, context: ModelContext, parseContext: PlanParseContext? = nil) throws -> TrainingPlan {
        let json = try extractJSON(from: responseText)

        guard let dict = json as? [String: Any] else {
            throw ParseError.invalidJSON("Root is not an object")
        }

        let plan = TrainingPlan()
        plan.name = dict["name"] as? String ?? "Training Plan"
        plan.goalDescription = dict["goal_description"] as? String ?? ""
        if let difficultyStr = dict["difficulty"] as? String,
           let level = DifficultyLevel(rawValue: difficultyStr) {
            plan.difficulty = level
        }
        plan.rawAIResponse = responseText
        plan.startDate = startDate

        guard let weeksArray = dict["weeks"] as? [[String: Any]] else {
            throw ParseError.missingField("weeks")
        }

        let calendar = Calendar.current
        var latestDate = startDate

        for weekDict in weeksArray {
            let week = TrainingWeek()
            week.weekNumber = weekDict["week_number"] as? Int ?? 1
            week.theme = weekDict["theme"] as? String ?? ""
            week.notes = weekDict["notes"] as? String ?? ""
            week.plan = plan

            // Parse percentage-based volume
            week.weeklyVolumePercent = weekDict["weekly_volume_percent"] as? Double ?? 0

            // Compute absolute volume from percentage
            if let ctx = parseContext, week.weeklyVolumePercent > 0 {
                let absoluteVolume = ctx.peakVolume * (week.weeklyVolumePercent / 100.0)
                switch ctx.volumeType {
                case .distance: week.totalDistanceKm = absoluteVolume
                case .time: week.totalDurationMinutes = absoluteVolume
                }
            } else {
                // Fallback: parse absolute values if present (backwards compat)
                week.totalDistanceKm = weekDict["total_distance_km"] as? Double ?? 0
                week.totalDurationMinutes = weekDict["total_duration_minutes"] as? Double ?? 0
            }

            context.insert(week)

            if let workoutsArray = weekDict["workouts"] as? [[String: Any]] {
                for workoutDict in workoutsArray {
                    let workout = parseWorkout(from: workoutDict, weekNumber: week.weekNumber, planStartDate: startDate, calendar: calendar, context: parseContext)
                    workout.week = week
                    context.insert(workout)

                    if workout.scheduledDate > latestDate {
                        latestDate = workout.scheduledDate
                    }

                    if let stepsArray = workoutDict["steps"] as? [[String: Any]] {
                        for (index, stepDict) in stepsArray.enumerated() {
                            let step = parseStep(from: stepDict, order: index, vdot: parseContext?.vdot)
                            step.workout = workout
                            context.insert(step)
                        }
                    }
                }
            }
        }

        plan.endDate = latestDate
        context.insert(plan)

        return plan
    }

    static func parseWorkout(from dict: [String: Any], weekNumber: Int, planStartDate: Date, calendar: Calendar, context: PlanParseContext? = nil) -> PlannedWorkout {
        let workout = PlannedWorkout()
        workout.name = dict["name"] as? String ?? "Workout"

        let typeStr = dict["type"] as? String ?? "easy"
        workout.workoutType = WorkoutType(rawValue: typeStr) ?? .easy

        workout.notes = dict["notes"] as? String ?? ""

        let locationStr = dict["location"] as? String ?? "outdoor"
        workout.location = WorkoutLocation(rawValue: locationStr) ?? .outdoor

        // Parse percentage-based volume and intensity
        workout.dailyVolumePercent = dict["daily_volume_percent"] as? Double ?? 0
        workout.intensityTarget = parseIntensity(from: dict["intensity"])

        // Compute absolute values from percentage + context
        if let ctx = context, workout.dailyVolumePercent > 0 {
            let absoluteVolume = ctx.peakVolume * (workout.dailyVolumePercent / 100.0)
            switch ctx.volumeType {
            case .distance: workout.distanceKm = absoluteVolume
            case .time: workout.durationMinutes = absoluteVolume
            }

            if let vdot = ctx.vdot {
                workout.targetPaceMinPerKm = PaceCalculator.pace(for: workout.intensityTarget, vdot: vdot)
            }
        } else {
            // Fallback: parse absolute values if present (backwards compat)
            workout.distanceKm = dict["distance_km"] as? Double ?? 0
            workout.durationMinutes = dict["duration_minutes"] as? Double ?? 0
            workout.targetPaceMinPerKm = dict["target_pace_min_per_km"] as? Double
        }

        let dayOfWeek = dict["day_of_week"] as? Int ?? 2
        let weekOffset = weekNumber - 1
        if let weekStart = calendar.date(byAdding: .weekOfYear, value: weekOffset, to: planStartDate) {
            let currentWeekday = calendar.component(.weekday, from: weekStart)
            let dayDiff = (dayOfWeek - currentWeekday + 7) % 7
            workout.scheduledDate = calendar.date(byAdding: .day, value: dayDiff, to: weekStart) ?? planStartDate
        }

        return workout
    }

    static func parseStep(from dict: [String: Any], order: Int, vdot: Double? = nil) -> PlannedWorkoutStep {
        let step = PlannedWorkoutStep()
        step.order = order

        let typeStr = dict["type"] as? String ?? "work"
        step.stepType = StepType(rawValue: typeStr) ?? .work

        step.name = dict["name"] as? String ?? ""

        let goalTypeStr = dict["goal_type"] as? String ?? "open"
        step.goalType = StepGoalType(rawValue: goalTypeStr) ?? .open

        step.goalValue = dict["goal_value"] as? Double
        step.hrZone = dict["hr_zone"] as? Int
        step.repeatCount = dict["repeat_count"] as? Int ?? 1
        step.groupId = dict["group_id"] as? Int ?? 0

        // Parse intensity and compute pace
        step.intensityTarget = parseIntensity(from: dict["intensity"])

        if let vdot {
            step.targetPaceMinPerKm = PaceCalculator.pace(for: step.intensityTarget, vdot: vdot)
        } else {
            // Fallback: parse absolute pace if present (backwards compat)
            step.targetPaceMinPerKm = dict["target_pace_min_per_km"] as? Double
        }

        return step
    }

    // MARK: - Outline Parsing

    static func parseOutline(from responseText: String, startDate: Date, endDate: Date, context: ModelContext, parseContext: PlanParseContext? = nil) throws -> TrainingPlan {
        let json = try extractJSON(from: responseText)

        guard let dict = json as? [String: Any] else {
            throw ParseError.invalidJSON("Root is not an object")
        }

        let plan = TrainingPlan()
        plan.name = dict["name"] as? String ?? "Training Plan"
        plan.goalDescription = dict["goal_description"] as? String ?? ""
        plan.outlineRawAIResponse = responseText
        plan.startDate = startDate
        plan.endDate = endDate

        if let vdot = dict["vdot"] as? Double {
            plan.cachedVDOT = vdot
        } else if let vdot = dict["vdot"] as? Int {
            plan.cachedVDOT = Double(vdot)
        }

        guard let weeksArray = dict["weeks"] as? [[String: Any]] else {
            throw ParseError.missingField("weeks")
        }

        for weekDict in weeksArray {
            let week = TrainingWeek()
            week.weekNumber = weekDict["week_number"] as? Int ?? 1
            week.theme = weekDict["theme"] as? String ?? ""
            week.notes = weekDict["notes"] as? String ?? ""
            week.workoutsGenerated = false
            week.plan = plan

            // Parse percentage-based volume
            week.weeklyVolumePercent = weekDict["weekly_volume_percent"] as? Double ?? 0

            // Compute absolute volume from percentage
            if let ctx = parseContext, week.weeklyVolumePercent > 0 {
                let absoluteVolume = ctx.peakVolume * (week.weeklyVolumePercent / 100.0)
                switch ctx.volumeType {
                case .distance: week.totalDistanceKm = absoluteVolume
                case .time: week.totalDurationMinutes = absoluteVolume
                }
            } else {
                // Fallback: parse absolute values if present (backwards compat)
                week.totalDistanceKm = weekDict["target_distance_km"] as? Double ?? weekDict["total_distance_km"] as? Double ?? 0
                week.totalDurationMinutes = weekDict["target_duration_minutes"] as? Double ?? weekDict["total_duration_minutes"] as? Double ?? 0
            }

            context.insert(week)
        }

        context.insert(plan)
        return plan
    }

    // MARK: - Weekly Workout Parsing

    static func parseWeekWorkouts(from responseText: String, week: TrainingWeek, planStartDate: Date, context: ModelContext, parseContext: PlanParseContext? = nil) throws {
        let json = try extractJSON(from: responseText)

        guard let dict = json as? [String: Any] else {
            throw ParseError.invalidJSON("Root is not an object")
        }

        let calendar = Calendar.current

        // Update week metadata if AI adjusted them
        if let theme = dict["theme"] as? String, !theme.isEmpty {
            week.theme = theme
        }
        if let notes = dict["notes"] as? String {
            week.notes = notes
        }

        // Update volume percent if AI adjusted it
        if let volumePct = dict["weekly_volume_percent"] as? Double {
            week.weeklyVolumePercent = volumePct
            if let ctx = parseContext, volumePct > 0 {
                let absoluteVolume = ctx.peakVolume * (volumePct / 100.0)
                switch ctx.volumeType {
                case .distance: week.totalDistanceKm = absoluteVolume
                case .time: week.totalDurationMinutes = absoluteVolume
                }
            }
        } else {
            // Fallback: parse absolute values
            if let dist = dict["total_distance_km"] as? Double {
                week.totalDistanceKm = dist
            }
            if let dur = dict["total_duration_minutes"] as? Double {
                week.totalDurationMinutes = dur
            }
        }

        if let workoutsArray = dict["workouts"] as? [[String: Any]] {
            for workoutDict in workoutsArray {
                let workout = parseWorkout(from: workoutDict, weekNumber: week.weekNumber, planStartDate: planStartDate, calendar: calendar, context: parseContext)
                workout.week = week
                context.insert(workout)

                if let stepsArray = workoutDict["steps"] as? [[String: Any]] {
                    for (index, stepDict) in stepsArray.enumerated() {
                        let step = parseStep(from: stepDict, order: index, vdot: parseContext?.vdot)
                        step.workout = workout
                        context.insert(step)
                    }
                }
            }
        }

        week.workoutsGenerated = true
    }

    // MARK: - Intensity Parsing

    static func parseIntensity(from value: Any?) -> IntensityTarget {
        if let str = value as? String {
            // Map AI's "repeat" to our .repetition case
            let mapped = str == "repeat" ? "repetition" : str
            return .named(WorkoutIntensity(rawValue: mapped) ?? .easy)
        }
        if let num = value as? Double {
            return .vo2Max(num)
        }
        if let num = value as? Int {
            return .vo2Max(Double(num))
        }
        return .named(.easy)
    }

    // MARK: - JSON Extraction

    static func extractJSON(from text: String) throws -> Any {
        if let data = text.data(using: .utf8),
           let json = try? JSONSerialization.jsonObject(with: data) {
            return json
        }

        let codeBlockPattern = "```(?:json)?\\s*\\n([\\s\\S]*?)\\n```"
        if let regex = try? NSRegularExpression(pattern: codeBlockPattern),
           let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
           let range = Range(match.range(at: 1), in: text) {
            let jsonStr = String(text[range])
            if let data = jsonStr.data(using: .utf8),
               let json = try? JSONSerialization.jsonObject(with: data) {
                return json
            }
        }

        if let firstBrace = text.firstIndex(of: "{"),
           let lastBrace = text.lastIndex(of: "}") {
            let jsonStr = String(text[firstBrace...lastBrace])
            if let data = jsonStr.data(using: .utf8),
               let json = try? JSONSerialization.jsonObject(with: data) {
                return json
            }
        }

        let preview = String(text.prefix(200))
        throw ParseError.noJSON(responsePreview: preview)
    }
}
