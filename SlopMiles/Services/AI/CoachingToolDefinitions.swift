import Foundation

struct CoachingToolDefinitions {

    // MARK: - Anthropic Format

    static func anthropicTools() -> [[String: JSONValue]] {
        [
            anthropicTool(
                name: "get_active_plan",
                description: "Get the user's active training plan overview including name, goal, weeks count, start/end dates, current week number, VDOT, and volume type.",
                properties: [:],
                required: []
            ),
            anthropicTool(
                name: "get_week_workouts",
                description: "Get all workouts for a specific week of the training plan, including name, type, date, distance, duration, pace, completion status, and actual vs planned metrics.",
                properties: [
                    "week_number": .object([
                        "type": "integer",
                        "description": "The week number to retrieve workouts for",
                    ]),
                ],
                required: ["week_number"]
            ),
            anthropicTool(
                name: "get_workout_details",
                description: "Get full details of a specific workout including steps, linked HealthKit data, and actual metrics.",
                properties: [
                    "workout_id": .object([
                        "type": "string",
                        "description": "The UUID of the workout to retrieve",
                    ]),
                ],
                required: ["workout_id"]
            ),
            anthropicTool(
                name: "get_running_history",
                description: "Get the user's recent running history from HealthKit including weekly distance, average pace, heart rate, and VO2max.",
                properties: [
                    "days": .object([
                        "type": "integer",
                        "description": "Number of days of history to retrieve (default 30)",
                    ]),
                ],
                required: []
            ),
            anthropicTool(
                name: "get_runner_profile",
                description: "Get the runner's profile including experience level, peak volume, VDOT, heart rate zones, unit preference, injury notes, and weekly schedule.",
                properties: [:],
                required: []
            ),
            anthropicTool(
                name: "update_workout",
                description: "Update properties of a specific planned workout.",
                properties: [
                    "workout_id": .object(["type": "string", "description": "The UUID of the workout to update"]),
                    "name": .object(["type": "string", "description": "New name for the workout"]),
                    "distance_km": .object(["type": "number", "description": "New distance in kilometers"]),
                    "duration_minutes": .object(["type": "number", "description": "New duration in minutes"]),
                    "intensity": .object(["type": "string", "description": "New intensity: easy, marathon, tempo, interval, or repeat"]),
                    "workout_type": .object(["type": "string", "description": "New type: easy, tempo, interval, long, recovery, race, rest"]),
                    "notes": .object(["type": "string", "description": "New notes for the workout"]),
                ],
                required: ["workout_id"]
            ),
            anthropicTool(
                name: "swap_workout_dates",
                description: "Swap the scheduled dates of two workouts.",
                properties: [
                    "workout_id_a": .object(["type": "string", "description": "UUID of the first workout"]),
                    "workout_id_b": .object(["type": "string", "description": "UUID of the second workout"]),
                ],
                required: ["workout_id_a", "workout_id_b"]
            ),
            anthropicTool(
                name: "skip_workout",
                description: "Mark a workout as skipped.",
                properties: [
                    "workout_id": .object(["type": "string", "description": "UUID of the workout to skip"]),
                    "reason": .object(["type": "string", "description": "Optional reason for skipping"]),
                ],
                required: ["workout_id"]
            ),
            anthropicTool(
                name: "set_week_workouts",
                description: "Generate and set workouts for a training week. Deletes existing workouts for the week, parses the provided JSON, creates new workouts, and schedules them to Apple Watch.",
                properties: [
                    "week_number": .object(["type": "integer", "description": "The week number to set workouts for"]),
                    "workouts_json": .object(["type": "string", "description": "JSON string matching the weekly workout schema with week_number, theme, weekly_volume_percent, notes, and workouts array"]),
                ],
                required: ["week_number", "workouts_json"]
            ),
        ]
    }

    // MARK: - OpenAI Format

    static func openAITools() -> [[String: JSONValue]] {
        anthropicTools().map { tool -> [String: JSONValue] in
            let name = tool["name"]!
            let description = tool["description"]!
            let inputSchema = tool["input_schema"]!
            return [
                "type": "function",
                "function": .object([
                    "name": name,
                    "description": description,
                    "parameters": inputSchema,
                ]),
            ]
        }
    }

    // MARK: - Helper

    private static func anthropicTool(
        name: String,
        description: String,
        properties: [String: JSONValue],
        required: [String]
    ) -> [String: JSONValue] {
        [
            "name": .string(name),
            "description": .string(description),
            "input_schema": .object([
                "type": "object",
                "properties": .object(properties),
                "required": .array(required.map { .string($0) }),
            ]),
        ]
    }
}
