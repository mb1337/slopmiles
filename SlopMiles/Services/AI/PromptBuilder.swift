import Foundation

struct PromptBuilder {
    static func systemPrompt(volumeType: VolumeType = .distance) -> String {
        let volumePhilosophy: String
        let volumeFormat: String

        switch volumeType {
        case .distance:
            volumePhilosophy = "- Gradual mileage increases: ALWAYS use the check_mileage_progression tool to validate your plan's weekly volumes"
            volumeFormat = "Important: All paces must come from tool results. All distances in km. All durations in minutes. All paces in min/km."
        case .time:
            volumePhilosophy = "- Gradual volume increases: ALWAYS use the check_mileage_progression tool with weekly_durations_minutes to validate your plan's weekly volumes"
            volumeFormat = "Important: All paces must come from tool results. Express weekly totals in total_duration_minutes and workout volumes in duration_minutes. Interval work segments may still use distance (meters). All paces in min/km."
        }

        return """
        You are an expert running coach creating personalized training plans. Follow these principles:

        ## Coaching Philosophy
        \(volumePhilosophy)
        - Include workout variety: easy runs, tempo runs, intervals, long runs, and recovery runs
        - Schedule recovery weeks every 3-4 weeks (30-40% volume reduction)
        - Taper appropriately before races (2-3 weeks, progressive volume reduction)
        - Respect the runner's experience level and injury history

        ## Tool Usage (MANDATORY)
        - ALWAYS use calculate_vdot and get_training_paces to determine accurate training paces. NEVER estimate or guess paces.
        - Use project_race_time to set realistic goal times
        - Use calculate_hr_zones if heart rate data is available
        - Use check_mileage_progression to validate your weekly volume plan before finalizing
        - Use get_weather_forecast if the runner has a home location, to adjust indoor/outdoor scheduling

        ## Scheduling Rules
        - Each workout MUST fit within the runner's available time window for that day
        - Assign long runs to days with the most available time
        - Mark days with no time window as rest days
        - Never schedule two hard sessions on consecutive days
        - Interval sessions should go on track-access days when available
        - Use treadmill as weather fallback when the runner has access

        ## Output Format
        Your final response must be ONLY valid JSON matching this schema (no markdown, no explanation outside the JSON):

        \(outputSchema(volumeType: volumeType))

        \(volumeFormat)
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
        endDate: Date
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
            prompt += "\n- Current weekly running volume: \(Int(profile.currentWeeklyVolumeMinutes)) minutes"
            prompt += "\n- Volume type: time-based"
        } else {
            prompt += "\n- Current weekly mileage: \(profile.currentWeeklyMileageKm) km"
        }

        prompt += "\n- Units preference: \(profile.unitPreference.rawValue)"

        if !profile.injuryNotes.isEmpty {
            prompt += "\n- Injury notes: \(profile.injuryNotes)"
        }
        if let maxHR = profile.maxHeartRate {
            prompt += "\n- Max heart rate: \(maxHR) bpm"
        }
        if let lthr = profile.lactateThresholdHR {
            prompt += "\n- Lactate threshold HR: \(lthr) bpm"
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
            if profile.volumeType == .time {
                prompt += "\nNote: HealthKit data is distance-based for VDOT/pace context. Plan volumes should be in minutes."
            }
        }

        if let lat = profile.homeLatitude, let lon = profile.homeLongitude {
            prompt += "\n\n## Location\nHome coordinates: \(lat), \(lon) (use get_weather_forecast to check conditions)"
        }

        prompt += """

        \n## Instructions
        1. First, calculate the runner's VDOT from their recent race data or estimate from their current fitness
        2. Get training paces using the VDOT
        3. If heart rate data is available, calculate HR zones
        4. If location is available, check weather forecast
        5. Design the training plan with appropriate progression
        6. Validate weekly mileage progression with the check_mileage_progression tool
        7. Output the final plan as JSON
        """

        return prompt
    }

    // MARK: - Outline Generation

    static func outlineSystemPrompt(volumeType: VolumeType = .distance) -> String {
        let volumePhilosophy: String
        let volumeField: String

        switch volumeType {
        case .distance:
            volumePhilosophy = "- Gradual mileage increases: ALWAYS use the check_mileage_progression tool to validate your plan's weekly volumes"
            volumeField = "target_distance_km"
        case .time:
            volumePhilosophy = "- Gradual volume increases: ALWAYS use the check_mileage_progression tool with weekly_durations_minutes to validate your plan's weekly volumes"
            volumeField = "target_duration_minutes"
        }

        return """
        You are an expert running coach creating a training plan outline. Generate ONLY the plan skeleton — weekly themes and volume targets. Do NOT generate individual workouts.

        ## Coaching Philosophy
        \(volumePhilosophy)
        - Schedule recovery weeks every 3-4 weeks (30-40% volume reduction)
        - Taper appropriately before races (2-3 weeks, progressive volume reduction)
        - Respect the runner's experience level and injury history

        ## Tool Usage (MANDATORY)
        - ALWAYS use calculate_vdot and get_training_paces to determine accurate training paces. NEVER estimate or guess paces.
        - Use project_race_time to set realistic goal times
        - Use check_mileage_progression to validate your weekly volume plan before finalizing

        ## Output Format
        Your final response must be ONLY valid JSON matching this schema (no markdown, no explanation outside the JSON):

        {
          "name": "string",
          "goal_description": "string",
          "vdot": number,
          "training_paces": {
            "easy_min_per_km": number,
            "marathon_min_per_km": number,
            "threshold_min_per_km": number,
            "interval_min_per_km": number,
            "repetition_min_per_km": number
          },
          "weeks": [
            {
              "week_number": number,
              "theme": "string",
              "\(volumeField)": number,
              "focus": "string",
              "workout_types": ["easy", "tempo", "interval", "long", "recovery"],
              "notes": "string"
            }
          ]
        }

        Important: All paces must come from tool results. All distances in km. All durations in minutes. All paces in min/km.
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
        endDate: Date
    ) -> String {
        var prompt = userPrompt(
            profile: profile, schedule: schedule, equipment: equipment,
            stats: stats, goalDescription: goalDescription,
            raceDistance: raceDistance, raceDate: raceDate,
            startDate: startDate, endDate: endDate
        )

        prompt += "\n\nGenerate ONLY the plan outline with weekly themes and volume targets. Do NOT generate individual workouts."

        return prompt
    }

    // MARK: - Weekly Workout Generation

    static func weeklySystemPrompt(volumeType: VolumeType = .distance) -> String {
        let volumeFormat: String

        switch volumeType {
        case .distance:
            volumeFormat = "Important: All paces must come from tool results. All distances in km. All durations in minutes. All paces in min/km."
        case .time:
            volumeFormat = "Important: All paces must come from tool results. Express workout volumes in duration_minutes. Interval work segments may still use distance (meters). All paces in min/km."
        }

        return """
        You are an expert running coach generating detailed workouts for a single week of training. You will be given the plan outline, this week's targets, and the runner's recent performance data.

        ## Performance Adaptation Rules
        - If the runner completed fewer than 75% of planned workouts in prior weeks, reduce this week's volume by 10-15%
        - If the runner completed all workouts and reported good performance, maintain or slightly increase targets
        - If the runner skipped multiple workouts, prioritize the most important sessions (long run, key workout)

        ## Scheduling Rules
        - Each workout MUST fit within the runner's available time window for that day
        - Assign long runs to days with the most available time
        - Mark days with no time window as rest days
        - Never schedule two hard sessions on consecutive days
        - Interval sessions should go on track-access days when available
        - Use treadmill as weather fallback when the runner has access

        ## Output Format
        Your final response must be ONLY valid JSON matching this schema (no markdown, no explanation outside the JSON):

        \(weeklyOutputSchema(volumeType: volumeType))

        \(volumeFormat)
        """
    }

    static func weeklyOutputSchema(volumeType: VolumeType = .distance) -> String {
        let weekVolume: String
        let workoutVolume: String

        switch volumeType {
        case .distance:
            weekVolume = "\"total_distance_km\": number,"
            workoutVolume = """
                  "distance_km": number,
                  "duration_minutes": number,
            """
        case .time:
            weekVolume = "\"total_duration_minutes\": number,"
            workoutVolume = """
                  "duration_minutes": number,
                  "distance_km": number or null,
            """
        }

        return """
        {
          "week_number": number,
          "theme": "string",
          \(weekVolume)
          "notes": "string",
          "workouts": [
            {
              "name": "string",
              "type": "easy|tempo|interval|long|recovery|race|rest",
              "day_of_week": number (1=Sunday, 7=Saturday),
        \(workoutVolume)
              "target_pace_min_per_km": number or null,
              "location": "outdoor|treadmill|track|trail",
              "notes": "string",
              "steps": [
                {
                  "type": "warmup|work|recovery|cooldown",
                  "name": "string",
                  "goal_type": "distance|time|open",
                  "goal_value": number or null (distance in meters, time in seconds),
                  "target_pace_min_per_km": number or null,
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
        performanceData: WeeklyPerformanceData
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
            prompt += "\n- VDOT: \(vdot) (use get_training_paces with this value)"
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
        """

        if plan.volumeType == .time {
            prompt += "\n- Target duration: \(Int(week.totalDurationMinutes)) minutes"
        } else {
            prompt += "\n- Target distance: \(week.totalDistanceKm) km"
        }

        if !week.notes.isEmpty {
            prompt += "\n- Notes: \(week.notes)"
        }

        prompt += "\n\n## Runner Profile"
        prompt += "\n- Experience: \(profile.experienceLevel.rawValue)"

        if profile.volumeType == .time {
            prompt += "\n- Current weekly volume: \(Int(profile.currentWeeklyVolumeMinutes)) minutes"
        } else {
            prompt += "\n- Current weekly mileage: \(profile.currentWeeklyMileageKm) km"
        }

        prompt += "\n- Units preference: \(profile.unitPreference.rawValue)"

        if !profile.injuryNotes.isEmpty {
            prompt += "\n- Injury notes: \(profile.injuryNotes)"
        }
        if let maxHR = profile.maxHeartRate {
            prompt += "\n- Max heart rate: \(maxHR) bpm"
        }
        if let lthr = profile.lactateThresholdHR {
            prompt += "\n- Lactate threshold HR: \(lthr) bpm"
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

        if let lat = profile.homeLatitude, let lon = profile.homeLongitude {
            prompt += "\n\n## Location\nHome coordinates: \(lat), \(lon) (use get_weather_forecast to check conditions)"
        }

        prompt += """

        \n## Instructions
        1. Use get_training_paces with the VDOT to get accurate paces
        2. If heart rate data is available, calculate HR zones
        3. If location is available, check weather forecast
        4. Generate workouts that match this week's theme and volume target
        5. Adapt based on prior weeks' performance data
        6. Output the week as JSON
        """

        return prompt
    }

    // MARK: - Output Schema

    static func outputSchema(volumeType: VolumeType = .distance) -> String {
        let weekVolume: String
        let workoutVolume: String

        switch volumeType {
        case .distance:
            weekVolume = "\"total_distance_km\": number,"
            workoutVolume = """
                  "distance_km": number,
                  "duration_minutes": number,
            """
        case .time:
            weekVolume = "\"total_duration_minutes\": number,"
            workoutVolume = """
                  "duration_minutes": number,
                  "distance_km": number or null,
            """
        }

        return """
        {
          "name": "string",
          "goal_description": "string",
          "vdot": number,
          "weeks": [
            {
              "week_number": number,
              "theme": "string",
              \(weekVolume)
              "notes": "string",
              "workouts": [
                {
                  "name": "string",
                  "type": "easy|tempo|interval|long|recovery|race|rest",
                  "day_of_week": number (1=Sunday, 7=Saturday),
        \(workoutVolume)
                  "target_pace_min_per_km": number or null,
                  "location": "outdoor|treadmill|track|trail",
                  "notes": "string",
                  "steps": [
                    {
                      "type": "warmup|work|recovery|cooldown",
                      "name": "string",
                      "goal_type": "distance|time|open",
                      "goal_value": number or null (distance in meters, time in seconds),
                      "target_pace_min_per_km": number or null,
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

    // MARK: - Ad-Hoc Workout

    static func adHocWorkoutSystemPrompt(volumeType: VolumeType = .distance) -> String {
        let volumeFields: String
        switch volumeType {
        case .distance:
            volumeFields = """
              "distance_km": number,
              "duration_minutes": number,
            """
        case .time:
            volumeFields = """
              "duration_minutes": number,
              "distance_km": number or null,
            """
        }

        return """
        You are an expert running coach generating a single workout session. Follow the same principles as for training plans.

        ## Tool Usage (MANDATORY)
        - ALWAYS use get_training_paces to determine accurate paces. NEVER estimate.
        - Use calculate_hr_zones if heart rate data is available.

        ## Output Format
        Your final response must be ONLY valid JSON matching this schema:
        {
          "name": "string",
          "type": "easy|tempo|interval|long|recovery",
        \(volumeFields)
          "target_pace_min_per_km": number or null,
          "location": "outdoor|treadmill|track|trail",
          "notes": "string",
          "steps": [
            {
              "type": "warmup|work|recovery|cooldown",
              "name": "string",
              "goal_type": "distance|time|open",
              "goal_value": number or null (distance in meters, time in seconds),
              "target_pace_min_per_km": number or null,
              "hr_zone": number or null,
              "repeat_count": number,
              "group_id": number (0 = ungrouped; steps sharing the same non-zero group_id form an interval repeat group, e.g. work+recovery repeated N times. The repeat_count on the first step in the group sets iterations.)
            }
          ]
        }
        """
    }
}
