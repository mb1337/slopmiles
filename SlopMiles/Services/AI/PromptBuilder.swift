import Foundation

struct PromptBuilder {
    static func systemPrompt() -> String {
        return """
        You are an expert running coach creating personalized training plans. Follow these principles:

        ## Coaching Philosophy
        - Gradual volume increases: ALWAYS use the check_mileage_progression tool to validate your plan's weekly volumes
        - Include workout variety: easy runs, tempo runs, intervals, long runs, and recovery runs
        - Only include warmup and cooldown steps for quality workouts (tempo, interval, long, race). Easy and recovery runs should be a single work step at easy pace — no warmup or cooldown needed.
        - Schedule recovery weeks every 3-4 weeks (30-40% volume reduction)
        - Taper appropriately before races (2-3 weeks, progressive volume reduction)
        - Respect the runner's experience level and injury history

        ## Volume & Intensity Rules
        - Specify weekly volume as a percentage of the runner's peak weekly volume (weekly_volume_percent).
        - Plans MUST build up to 100% of peak weekly volume at the peak training week. For example, if the plan is 12 weeks, the highest-volume week should have weekly_volume_percent = 100. Earlier weeks build progressively toward this peak. Recovery weeks drop to 60-70%.
        - Specify daily volume as a percentage of the runner's peak weekly volume (daily_volume_percent).
        - CRITICAL: The sum of all daily_volume_percent values for workouts in a week MUST EQUAL the weekly_volume_percent. For example, if weekly_volume_percent is 80, the daily values might be 15 + 12 + 15 + 0 + 12 + 26 + 0 = 80. Do NOT let daily values exceed the weekly total.
        - For intensity, use a named level (easy, marathon, tempo, interval, repeat) or a number representing %VO2max for finer control (e.g. 96). Each workout and step gets exactly one intensity value.

        ## Tool Usage
        - Use calculate_vdot to determine the runner's VDOT from race data
        - Use project_race_time to set realistic goal times
        - Use calculate_hr_zones if heart rate data is available
        - Use check_mileage_progression to validate your weekly volume plan before finalizing

        ## Scheduling Rules
        - Each workout MUST fit within the runner's available time window for that day
        - Assign long runs to days with the most available time
        - Mark days with no time window as rest days
        - Never schedule two hard sessions on consecutive days
        - Interval sessions should go on track-access days when available
        - Use treadmill as weather fallback when the runner has access

        ## Output Format
        Your final response must be ONLY valid JSON matching this schema (no markdown, no explanation outside the JSON):

        \(outputSchema())
        """
    }

    static func userPrompt(
        profile: UserProfile,
        schedule: WeeklySchedule,
        equipment: RunnerEquipment,
        stats: RunningStats,
        goalDescription: String,
        raceDistance: Double?,
        raceDate: Date?,
        startDate: Date,
        endDate: Date,
        weatherData: [String: JSONValue]? = nil
    ) -> String {
        let dateFormatter = ISO8601DateFormatter()
        dateFormatter.formatOptions = [.withFullDate]

        var prompt = """
        Create a training plan with the following details:

        ## Goal
        \(goalDescription)
        """

        if let distance = raceDistance {
            prompt += "\nRace distance: \(distance) meters"
        }
        if let date = raceDate {
            prompt += "\nRace date: \(dateFormatter.string(from: date))"
        }

        prompt += """

        \nPlan start date: \(dateFormatter.string(from: startDate))
        Plan end date: \(dateFormatter.string(from: endDate))

        ## Runner Profile
        - Experience: \(profile.experienceLevel.rawValue)
        """

        if profile.volumeType == .time {
            prompt += "\n- Peak weekly running volume: \(Int(profile.peakWeeklyVolumeMinutes)) minutes"
            prompt += "\n- Volume type: time-based"
        } else {
            prompt += "\n- Peak weekly mileage: \(profile.peakWeeklyMileageKm) km"
        }

        prompt += "\n- Units preference: \(profile.unitPreference.rawValue)"

        if !profile.injuryNotes.isEmpty {
            prompt += "\n- Injury notes: \(profile.injuryNotes)"
        }
        if let maxHR = profile.maxHeartRate {
            prompt += "\n- Max heart rate: \(maxHR) bpm"
        }
        if let restingHR = profile.restingHeartRate {
            prompt += "\n- Resting heart rate: \(restingHR) bpm"
        }
        if let lthr = profile.lactateThresholdHR {
            prompt += "\n- Lactate threshold HR: \(lthr) bpm"
        }
        if let vdot = profile.vdot {
            prompt += "\n- VDOT: \(String(format: "%.1f", vdot))"
        }

        if let scheduleJSON = try? JSONSerialization.data(withJSONObject: schedule.dictionaryForPrompt().map(\.anyValue), options: .prettyPrinted),
           let scheduleStr = String(data: scheduleJSON, encoding: .utf8) {
            prompt += "\n\n## Weekly Schedule\n\(scheduleStr)"
        }

        if let equipJSON = try? JSONSerialization.data(withJSONObject: equipment.dictionaryForPrompt().mapValues(\.anyValue), options: .prettyPrinted),
           let equipStr = String(data: equipJSON, encoding: .utf8) {
            prompt += "\n\n## Equipment & Facilities\n\(equipStr)"
        }

        if let statsJSON = try? JSONSerialization.data(withJSONObject: stats.dictionaryForPrompt().mapValues(\.anyValue), options: .prettyPrinted),
           let statsStr = String(data: statsJSON, encoding: .utf8) {
            prompt += "\n\n## Recent Running Data\n\(statsStr)"
        }

        if let weatherData {
            prompt += formatWeatherSection(weatherData)
        }

        prompt += """

        \n## Instructions
        1. If the runner has race data, calculate their VDOT
        2. If heart rate data is available, calculate HR zones
        3. Consider the weather forecast when deciding indoor vs outdoor workouts
        4. Design the training plan with appropriate progression using volume percentages and intensity levels
        5. Validate weekly mileage progression with the check_mileage_progression tool
        6. Output the final plan as JSON
        """

        return prompt
    }

    // MARK: - Outline Generation

    static func outlineSystemPrompt() -> String {
        return """
        You are an expert running coach creating a training plan outline. Generate ONLY the plan skeleton — weekly themes and volume targets. Do NOT generate individual workouts.

        ## Coaching Philosophy
        - Gradual volume increases: ALWAYS use the check_mileage_progression tool to validate your plan's weekly volumes
        - Schedule recovery weeks every 3-4 weeks (30-40% volume reduction)
        - Taper appropriately before races (2-3 weeks, progressive volume reduction)
        - Respect the runner's experience level and injury history

        ## Volume Rules
        - Specify weekly volume as a percentage of the runner's peak weekly volume (weekly_volume_percent)
        - Plans MUST build up to 100% of peak weekly volume at the peak training week. For example, if the plan is 12 weeks, the highest-volume week should have weekly_volume_percent = 100. Earlier weeks build progressively toward this peak. Recovery weeks drop to 60-70%.

        ## Tool Usage
        - Use calculate_vdot to determine the runner's VDOT from race data
        - Use project_race_time to set realistic goal times
        - Use check_mileage_progression to validate your weekly volume plan before finalizing

        ## Output Format
        Your final response must be ONLY valid JSON matching this schema (no markdown, no explanation outside the JSON):

        {
          "name": "string",
          "goal_description": "string",
          "vdot": number or null,
          "weeks": [
            {
              "week_number": number,
              "theme": "string",
              "weekly_volume_percent": number (% of peak weekly volume),
              "focus": "string",
              "workout_types": ["easy", "tempo", "interval", "long", "recovery"],
              "notes": "string"
            }
          ]
        }
        """
    }

    static func outlineUserPrompt(
        profile: UserProfile,
        schedule: WeeklySchedule,
        equipment: RunnerEquipment,
        stats: RunningStats,
        goalDescription: String,
        raceDistance: Double?,
        raceDate: Date?,
        startDate: Date,
        endDate: Date,
        weatherData: [String: JSONValue]? = nil
    ) -> String {
        var prompt = userPrompt(
            profile: profile, schedule: schedule, equipment: equipment,
            stats: stats, goalDescription: goalDescription,
            raceDistance: raceDistance, raceDate: raceDate,
            startDate: startDate, endDate: endDate,
            weatherData: weatherData
        )

        prompt += "\n\nGenerate ONLY the plan outline with weekly themes and volume targets. Do NOT generate individual workouts."

        return prompt
    }

    // MARK: - Weekly Workout Generation

    static func weeklySystemPrompt() -> String {
        return """
        You are an expert running coach generating detailed workouts for a single week of training. You will be given the plan outline, this week's targets, and the runner's recent performance data.

        ## Performance Adaptation Rules
        - If the runner completed fewer than 75% of planned workouts in prior weeks, reduce this week's volume by 10-15%
        - If the runner completed all workouts and reported good performance, maintain or slightly increase targets
        - If the runner skipped multiple workouts, prioritize the most important sessions (long run, key workout)

        ## Volume & Intensity Rules
        - Specify daily volume as a percentage of the runner's peak weekly volume (daily_volume_percent).
        - CRITICAL: The sum of all daily_volume_percent values for workouts in the week MUST EQUAL the weekly_volume_percent. For example, if weekly_volume_percent is 80, the daily values might be 15 + 12 + 15 + 0 + 12 + 26 + 0 = 80. Do NOT let daily values exceed the weekly total.
        - For intensity, use a named level (easy, marathon, tempo, interval, repeat) or a number representing %VO2max for finer control (e.g. 96). Each workout and step gets exactly one intensity value.

        ## Workout Structure Rules
        - Only include warmup and cooldown steps for quality workouts (tempo, interval, long, race). Easy and recovery runs should be a single work step at easy pace — no warmup or cooldown needed.

        ## Scheduling Rules
        - Each workout MUST fit within the runner's available time window for that day
        - Assign long runs to days with the most available time
        - Mark days with no time window as rest days
        - Never schedule two hard sessions on consecutive days
        - Interval sessions should go on track-access days when available
        - Use treadmill as weather fallback when the runner has access

        ## Output Format
        Your final response must be ONLY valid JSON matching this schema (no markdown, no explanation outside the JSON):

        \(weeklyOutputSchema())
        """
    }

    static func weeklyOutputSchema() -> String {
        return """
        {
          "week_number": number,
          "theme": "string",
          "weekly_volume_percent": number (% of peak weekly volume),
          "notes": "string",
          "workouts": [
            {
              "name": "string",
              "type": "easy|tempo|interval|long|recovery|race|rest",
              "day_of_week": number (1=Sunday, 7=Saturday),
              "daily_volume_percent": number (% of peak weekly volume),
              "intensity": "easy|marathon|tempo|interval|repeat" or number (% VO2max),
              "location": "outdoor|treadmill|track|trail",
              "notes": "string",
              "steps": [
                {
                  "type": "warmup|work|recovery|cooldown (warmup/cooldown only for quality sessions: tempo, interval, long, race. Easy/recovery runs use a single work step.)",
                  "name": "string",
                  "goal_type": "distance|time|open",
                  "goal_value": number or null (distance in meters, time in seconds),
                  "intensity": "easy|marathon|tempo|interval|repeat" or number (% VO2max),
                  "hr_zone": number or null,
                  "repeat_count": number,
                  "group_id": number (0 = ungrouped; steps sharing the same non-zero group_id form an interval repeat group)
                }
              ]
            }
          ]
        }
        """
    }

    static func weeklyUserPrompt(
        plan: TrainingPlan,
        week: TrainingWeek,
        profile: UserProfile,
        schedule: WeeklySchedule,
        equipment: RunnerEquipment,
        performanceData: WeeklyPerformanceData,
        weatherData: [String: JSONValue]? = nil
    ) -> String {
        let dateFormatter = ISO8601DateFormatter()
        dateFormatter.formatOptions = [.withFullDate]

        var prompt = """
        Generate detailed workouts for Week \(week.weekNumber) of the training plan.

        ## Plan Context
        - Plan: \(plan.name)
        - Goal: \(plan.goalDescription)
        - Total weeks: \(plan.totalWeeks)
        """

        if let vdot = plan.cachedVDOT {
            prompt += "\n- VDOT: \(vdot)"
        } else {
            prompt += "\n- VDOT: not available (use calculate_vdot to determine)"
        }

        if let raceDistance = plan.raceDistance {
            prompt += "\n- Race distance: \(raceDistance) meters"
        }
        if let raceDate = plan.raceDate {
            prompt += "\n- Race date: \(dateFormatter.string(from: raceDate))"
        }

        prompt += """

        \n## This Week's Outline
        - Week \(week.weekNumber): \(week.theme)
        - Target volume: \(Int(week.weeklyVolumePercent))% of peak
        """

        if !week.notes.isEmpty {
            prompt += "\n- Notes: \(week.notes)"
        }

        prompt += "\n\n## Runner Profile"
        prompt += "\n- Experience: \(profile.experienceLevel.rawValue)"

        if profile.volumeType == .time {
            prompt += "\n- Peak weekly volume: \(Int(profile.peakWeeklyVolumeMinutes)) minutes"
        } else {
            prompt += "\n- Peak weekly mileage: \(profile.peakWeeklyMileageKm) km"
        }

        prompt += "\n- Units preference: \(profile.unitPreference.rawValue)"

        if !profile.injuryNotes.isEmpty {
            prompt += "\n- Injury notes: \(profile.injuryNotes)"
        }
        if let maxHR = profile.maxHeartRate {
            prompt += "\n- Max heart rate: \(maxHR) bpm"
        }
        if let restingHR = profile.restingHeartRate {
            prompt += "\n- Resting heart rate: \(restingHR) bpm"
        }
        if let lthr = profile.lactateThresholdHR {
            prompt += "\n- Lactate threshold HR: \(lthr) bpm"
        }
        if let vdot = profile.vdot {
            prompt += "\n- VDOT: \(String(format: "%.1f", vdot))"
        }

        if let scheduleJSON = try? JSONSerialization.data(withJSONObject: schedule.dictionaryForPrompt().map(\.anyValue), options: .prettyPrinted),
           let scheduleStr = String(data: scheduleJSON, encoding: .utf8) {
            prompt += "\n\n## Weekly Schedule\n\(scheduleStr)"
        }

        if let equipJSON = try? JSONSerialization.data(withJSONObject: equipment.dictionaryForPrompt().mapValues(\.anyValue), options: .prettyPrinted),
           let equipStr = String(data: equipJSON, encoding: .utf8) {
            prompt += "\n\n## Equipment & Facilities\n\(equipStr)"
        }

        if !performanceData.priorWeekSummaries.isEmpty {
            prompt += "\n\n## Prior Weeks Performance"
            for summary in performanceData.priorWeekSummaries {
                prompt += "\n- Week \(summary.weekNumber) (\(summary.theme)):"
                prompt += " \(summary.completedWorkouts)/\(summary.totalWorkouts) workouts completed"
                if summary.skippedWorkouts > 0 {
                    prompt += ", \(summary.skippedWorkouts) skipped"
                }
                if plan.volumeType == .time {
                    prompt += ", planned \(Int(summary.plannedDurationMinutes)) min"
                } else {
                    prompt += ", planned \(summary.plannedDistanceKm) km"
                }
            }
        }

        if let weatherData {
            prompt += formatWeatherSection(weatherData)
        }

        prompt += """

        \n## Instructions
        1. If heart rate data is available, calculate HR zones
        2. Consider the weather forecast when deciding indoor vs outdoor workouts
        3. Generate workouts that match this week's theme and volume target using volume percentages and intensity levels
        4. Adapt based on prior weeks' performance data
        5. Output the week as JSON
        """

        return prompt
    }

    // MARK: - Output Schema

    static func outputSchema() -> String {
        return """
        {
          "name": "string",
          "goal_description": "string",
          "vdot": number or null,
          "weeks": [
            {
              "week_number": number,
              "theme": "string",
              "weekly_volume_percent": number (% of peak weekly volume),
              "notes": "string",
              "workouts": [
                {
                  "name": "string",
                  "type": "easy|tempo|interval|long|recovery|race|rest",
                  "day_of_week": number (1=Sunday, 7=Saturday),
                  "daily_volume_percent": number (% of peak weekly volume),
                  "intensity": "easy|marathon|tempo|interval|repeat" or number (% VO2max),
                  "location": "outdoor|treadmill|track|trail",
                  "notes": "string",
                  "steps": [
                    {
                      "type": "warmup|work|recovery|cooldown (warmup/cooldown only for quality sessions: tempo, interval, long, race. Easy/recovery runs use a single work step.)",
                      "name": "string",
                      "goal_type": "distance|time|open",
                      "goal_value": number or null (distance in meters, time in seconds),
                      "intensity": "easy|marathon|tempo|interval|repeat" or number (% VO2max),
                      "hr_zone": number or null,
                      "repeat_count": number,
                      "group_id": number (0 = ungrouped; steps sharing the same non-zero group_id form an interval repeat group, e.g. work+recovery repeated N times. The repeat_count on the first step in the group sets iterations.)
                    }
                  ]
                }
              ]
            }
          ]
        }
        """
    }

    // MARK: - Weather Formatting

    static func formatWeatherSection(_ weatherData: [String: JSONValue]) -> String {
        guard case .array(let days) = weatherData["daily"] else { return "" }
        var section = "\n\n## Weather Forecast (7-day)"
        for day in days {
            guard case .object(let d) = day,
                  let date = d["date"]?.stringValue,
                  let condition = d["condition"]?.stringValue else { continue }
            let high = d["temp_high_c"]?.doubleValue.map { String(format: "%.0f", $0) } ?? "?"
            let low = d["temp_low_c"]?.doubleValue.map { String(format: "%.0f", $0) } ?? "?"
            let precip = d["precipitation_probability_pct"]?.intValue.map { "\($0)" } ?? "?"
            let wind = d["wind_speed_kmh"]?.doubleValue.map { String(format: "%.0f", $0) } ?? "?"
            section += "\n- \(date): \(condition), \(low)-\(high) C, precip \(precip)%, wind \(wind) km/h"
        }
        return section
    }

    // MARK: - Ad-Hoc Workout

    static func adHocWorkoutSystemPrompt() -> String {
        return """
        You are an expert running coach generating a single workout session. Follow the same principles as for training plans.

        ## Volume & Intensity Rules
        - Specify volume as daily_volume_percent (percentage of the runner's peak weekly volume)
        - For intensity, use a named level (easy, marathon, tempo, interval, repeat) or a number representing %VO2max for finer control (e.g. 96). Each workout and step gets exactly one intensity value.

        ## Tool Usage
        - Use calculate_hr_zones if heart rate data is available.

        ## Workout Structure Rules
        - Only include warmup and cooldown steps for quality workouts (tempo, interval, long, race). Easy and recovery runs should be a single work step at easy pace — no warmup or cooldown needed.

        ## Output Format
        Your final response must be ONLY valid JSON matching this schema:
        {
          "name": "string",
          "type": "easy|tempo|interval|long|recovery",
          "daily_volume_percent": number (% of peak weekly volume),
          "intensity": "easy|marathon|tempo|interval|repeat" or number (% VO2max),
          "location": "outdoor|treadmill|track|trail",
          "notes": "string",
          "steps": [
            {
              "type": "warmup|work|recovery|cooldown (warmup/cooldown only for quality sessions: tempo, interval, long, race. Easy/recovery runs use a single work step.)",
              "name": "string",
              "goal_type": "distance|time|open",
              "goal_value": number or null (distance in meters, time in seconds),
              "intensity": "easy|marathon|tempo|interval|repeat" or number (% VO2max),
              "hr_zone": number or null,
              "repeat_count": number,
              "group_id": number (0 = ungrouped; steps sharing the same non-zero group_id form an interval repeat group, e.g. work+recovery repeated N times. The repeat_count on the first step in the group sets iterations.)
            }
          ]
        }
        """
    }
}
