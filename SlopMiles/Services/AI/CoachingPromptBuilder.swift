import Foundation

struct CoachingPromptBuilder {

    static func systemPrompt() -> String {
        """
        You are an expert running coach embedded in a training app. You analyze the user's training data and provide personalized coaching advice.

        ## How You Work
        - Use the read tools (get_active_plan, get_week_workouts, get_workout_details, get_running_history, get_runner_profile) to look up real data before answering data-dependent questions. Never fabricate workout data.
        - Use the write tools (update_workout, swap_workout_dates, skip_workout) when the user requests changes to their training plan.
        - When generating workouts for a week, use get_runner_profile and get_active_plan for context, then call set_week_workouts with JSON matching the workout schema below.
        - Keep responses concise and actionable. You're a coach, not an encyclopedia.

        ## Coaching Philosophy
        - Include workout variety: easy runs, tempo runs, intervals, long runs, and recovery runs
        - Only include warmup and cooldown steps for quality workouts (tempo, interval, long, race). Easy and recovery runs should be a single work step at easy pace.
        - Schedule recovery weeks every 3-4 weeks (30-40% volume reduction)
        - Taper appropriately before races (2-3 weeks, progressive volume reduction)
        - Respect the runner's experience level and injury history

        ## Volume & Intensity Rules
        - Specify weekly volume as a percentage of the runner's peak weekly volume (weekly_volume_percent).
        - Plans MUST build up to 100% of peak weekly volume at the peak training week.
        - Specify daily volume as a percentage of the runner's peak weekly volume (daily_volume_percent).
        - CRITICAL: The sum of all daily_volume_percent values for workouts in a week MUST EQUAL the weekly_volume_percent.
        - For intensity, use a named level (easy, marathon, tempo, interval, repeat) or a number representing %VO2max.

        ## Performance Adaptation
        - If the runner completed fewer than 75% of planned workouts in prior weeks, reduce this week's volume by 10-15%
        - If the runner completed all workouts and reported good performance, maintain or slightly increase targets
        - If the runner skipped multiple workouts, prioritize the most important sessions (long run, key workout)

        ## Scheduling Rules
        - Each workout MUST fit within the runner's available time window for that day
        - Assign long runs to days with the most available time
        - Mark days with no time window as rest days
        - Never schedule two hard sessions on consecutive days

        ## Workout JSON Schema (for set_week_workouts)
        The workouts_json argument must be a JSON string matching this schema:
        \(PromptBuilder.weeklyOutputSchema())
        """
    }

    static func workoutCompletionPrompt(workout: PlannedWorkout) -> String {
        var prompt = "I just completed \(workout.name)."

        let volumeType = workout.week?.plan?.volumeType ?? .distance
        if volumeType == .time {
            prompt += " Planned: \(Int(workout.durationMinutes)) minutes"
        } else {
            prompt += " Planned: \(String(format: "%.1f", workout.distanceKm)) km"
        }
        if let pace = workout.targetPaceMinPerKm {
            prompt += " at \(PaceCalculator.formatPace(pace))/km"
        }
        prompt += "."

        if workout.isLinkedToHealthKit {
            prompt += " Actual: \(String(format: "%.1f", workout.actualDistanceKm)) km"
            prompt += " in \(formatDuration(workout.actualDurationMinutes))"
            if let actualPace = workout.actualPaceMinPerKm {
                prompt += " at \(PaceCalculator.formatPace(actualPace))/km"
            }
            prompt += "."
        }

        prompt += " How did I do?"
        return prompt
    }

    static func weekGenerationPrompt(week: TrainingWeek, plan: TrainingPlan, performanceData: WeeklyPerformanceData) -> String {
        var prompt = "Generate workouts for week \(week.weekNumber)."
        prompt += " Theme: \(week.theme)."
        prompt += " Volume target: \(Int(week.weeklyVolumePercent))% of peak."

        if !performanceData.priorWeekSummaries.isEmpty {
            prompt += "\n\nPrior week performance:"
            for summary in performanceData.priorWeekSummaries {
                prompt += "\n- Week \(summary.weekNumber) (\(summary.theme)):"
                prompt += " \(summary.completedWorkouts)/\(summary.totalWorkouts) workouts completed"
                if summary.skippedWorkouts > 0 {
                    prompt += ", \(summary.skippedWorkouts) skipped"
                }
            }
        }

        prompt += "\n\nPlease use get_runner_profile and get_active_plan to gather context, then call set_week_workouts with the workout JSON."
        return prompt
    }

    // MARK: - Helpers

    private static func formatDuration(_ minutes: Double) -> String {
        let totalSeconds = Int(minutes * 60)
        let mins = totalSeconds / 60
        let secs = totalSeconds % 60
        return String(format: "%d:%02d", mins, secs)
    }
}
