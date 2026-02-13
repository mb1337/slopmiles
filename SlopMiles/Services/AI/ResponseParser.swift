import Foundation
import SwiftData

struct ResponseParser {
    enum ParseError: Error, LocalizedError {
        case noJSON
        case invalidJSON(String)
        case missingField(String)

        var errorDescription: String? {
            switch self {
            case .noJSON: return "No JSON found in AI response"
            case .invalidJSON(let msg): return "Invalid JSON: \(msg)"
            case .missingField(let field): return "Missing required field: \(field)"
            }
        }
    }

    static func parsePlan(from responseText: String, startDate: Date, context: ModelContext) throws -> TrainingPlan {
        let json = try extractJSON(from: responseText)

        guard let dict = json as? [String: Any] else {
            throw ParseError.invalidJSON("Root is not an object")
        }

        let plan = TrainingPlan()
        plan.name = dict["name"] as? String ?? "Training Plan"
        plan.goalDescription = dict["goal_description"] as? String ?? ""
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
            week.totalDistanceKm = weekDict["total_distance_km"] as? Double ?? 0
            week.notes = weekDict["notes"] as? String ?? ""
            week.plan = plan

            context.insert(week)

            if let workoutsArray = weekDict["workouts"] as? [[String: Any]] {
                for workoutDict in workoutsArray {
                    let workout = parseWorkout(from: workoutDict, weekNumber: week.weekNumber, planStartDate: startDate, calendar: calendar)
                    workout.week = week
                    context.insert(workout)

                    if workout.scheduledDate > latestDate {
                        latestDate = workout.scheduledDate
                    }

                    if let stepsArray = workoutDict["steps"] as? [[String: Any]] {
                        for (index, stepDict) in stepsArray.enumerated() {
                            let step = parseStep(from: stepDict, order: index)
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

    static func parseWorkout(from dict: [String: Any], weekNumber: Int, planStartDate: Date, calendar: Calendar) -> PlannedWorkout {
        let workout = PlannedWorkout()
        workout.name = dict["name"] as? String ?? "Workout"

        let typeStr = dict["type"] as? String ?? "easy"
        workout.workoutType = WorkoutType(rawValue: typeStr) ?? .easy

        workout.distanceKm = dict["distance_km"] as? Double ?? 0
        workout.durationMinutes = dict["duration_minutes"] as? Double ?? 0
        workout.targetPaceMinPerKm = dict["target_pace_min_per_km"] as? Double
        workout.notes = dict["notes"] as? String ?? ""

        let locationStr = dict["location"] as? String ?? "outdoor"
        workout.location = WorkoutLocation(rawValue: locationStr) ?? .outdoor

        let dayOfWeek = dict["day_of_week"] as? Int ?? 2
        let weekOffset = weekNumber - 1
        if let weekStart = calendar.date(byAdding: .weekOfYear, value: weekOffset, to: planStartDate) {
            let currentWeekday = calendar.component(.weekday, from: weekStart)
            let dayDiff = (dayOfWeek - currentWeekday + 7) % 7
            workout.scheduledDate = calendar.date(byAdding: .day, value: dayDiff, to: weekStart) ?? planStartDate
        }

        return workout
    }

    static func parseStep(from dict: [String: Any], order: Int) -> PlannedWorkoutStep {
        let step = PlannedWorkoutStep()
        step.order = order

        let typeStr = dict["type"] as? String ?? "work"
        step.stepType = StepType(rawValue: typeStr) ?? .work

        step.name = dict["name"] as? String ?? ""

        let goalTypeStr = dict["goal_type"] as? String ?? "open"
        step.goalType = StepGoalType(rawValue: goalTypeStr) ?? .open

        step.goalValue = dict["goal_value"] as? Double
        step.targetPaceMinPerKm = dict["target_pace_min_per_km"] as? Double
        step.hrZone = dict["hr_zone"] as? Int
        step.repeatCount = dict["repeat_count"] as? Int ?? 1
        step.groupId = dict["group_id"] as? Int ?? 0

        return step
    }

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

        throw ParseError.noJSON
    }
}
