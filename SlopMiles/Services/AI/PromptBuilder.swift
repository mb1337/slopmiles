import Foundation

struct PromptBuilder {
    static func systemPrompt() -> String {
        """
        You are an expert running coach creating personalized training plans. Follow these principles:

        ## Coaching Philosophy
        - Gradual mileage increases: ALWAYS use the check_mileage_progression tool to validate your plan's weekly volumes
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

        \(outputSchema())

        Important: All paces must come from tool results. All distances in km. All durations in minutes. All paces in min/km.

        ## Batching
        For long plans, you may be asked to generate only a specific range of weeks per request. When batch instructions are present:
        - Generate ONLY the requested weeks (e.g. weeks 5-8 of 12)
        - Maintain logical progression from previous weeks (the conversation history contains all prior tool results and context)
        - Do NOT re-call tools that were already called in earlier batches — reuse those results
        - Output the same JSON schema but include only the requested weeks in the "weeks" array
        - Number weeks according to the requested range (e.g. week_number 5, 6, 7, 8)
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
        batchRange: (start: Int, end: Int, total: Int)? = nil
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
        - Current weekly mileage: \(profile.currentWeeklyMileageKm) km
        - Units preference: \(profile.unitPreference.rawValue)
        """

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

        if let batch = batchRange {
            prompt += """

            \n## Batch Instructions
            Generate ONLY weeks \(batch.start) through \(batch.end) of this \(batch.total)-week plan.
            Number these weeks \(batch.start) to \(batch.end) in the output JSON.
            """
        }

        return prompt
    }

    static func outputSchema() -> String {
        """
        {
          "name": "string",
          "goal_description": "string",
          "vdot": number,
          "weeks": [
            {
              "week_number": number,
              "theme": "string",
              "total_distance_km": number,
              "notes": "string",
              "workouts": [
                {
                  "name": "string",
                  "type": "easy|tempo|interval|long|recovery|race|rest",
                  "day_of_week": number (1=Sunday, 7=Saturday),
                  "distance_km": number,
                  "duration_minutes": number,
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

    static func batchContinuationPrompt(
        batchStart: Int,
        batchEnd: Int,
        totalWeeks: Int
    ) -> String {
        """
        Continue the training plan. Generate weeks \(batchStart) through \(batchEnd) of \(totalWeeks).

        - Maintain logical progression from the previous weeks
        - Reuse all tool results from earlier in this conversation (do NOT re-call tools)
        - Output the same JSON schema with only weeks \(batchStart)-\(batchEnd) in the "weeks" array
        - Number these weeks \(batchStart) to \(batchEnd)
        """
    }

    static func adHocWorkoutSystemPrompt() -> String {
        """
        You are an expert running coach generating a single workout session. Follow the same principles as for training plans.

        ## Tool Usage (MANDATORY)
        - ALWAYS use get_training_paces to determine accurate paces. NEVER estimate.
        - Use calculate_hr_zones if heart rate data is available.

        ## Output Format
        Your final response must be ONLY valid JSON matching this schema:
        {
          "name": "string",
          "type": "easy|tempo|interval|long|recovery",
          "distance_km": number,
          "duration_minutes": number,
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
