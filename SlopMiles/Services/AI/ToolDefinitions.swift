import Foundation

struct ToolDefinitions {
    static func anthropicTools() -> [[String: JSONValue]] {
        tools.map { tool in
            [
                "name": .string(tool.name),
                "description": .string(tool.description),
                "input_schema": .object(tool.inputSchema),
            ]
        }
    }

    static func openAITools() -> [[String: JSONValue]] {
        tools.map { tool in
            [
                "type": "function",
                "function": .object([
                    "name": .string(tool.name),
                    "description": .string(tool.description),
                    "parameters": .object(tool.inputSchema),
                ]),
            ]
        }
    }

    struct ToolDef: Sendable {
        let name: String
        let description: String
        let inputSchema: [String: JSONValue]
    }

    static let tools: [ToolDef] = [
        ToolDef(
            name: "calculate_vdot",
            description: "Calculate VDOT fitness score from a race result. VDOT is Jack Daniels' measure of running fitness based on race performance.",
            inputSchema: [
                "type": "object",
                "properties": .object([
                    "race_distance_meters": .object(["type": "number", "description": "Race distance in meters (e.g., 5000, 10000, 21097.5, 42195)"]),
                    "race_time_seconds": .object(["type": "number", "description": "Race finish time in seconds"]),
                ]),
                "required": .array([.string("race_distance_meters"), .string("race_time_seconds")]),
            ]
        ),
        ToolDef(
            name: "project_race_time",
            description: "Predict finish time for a race distance based on VDOT.",
            inputSchema: [
                "type": "object",
                "properties": .object([
                    "vdot": .object(["type": "number", "description": "VDOT fitness score"]),
                    "distance_meters": .object(["type": "number", "description": "Target race distance in meters"]),
                ]),
                "required": .array([.string("vdot"), .string("distance_meters")]),
            ]
        ),
        ToolDef(
            name: "calculate_hr_zones",
            description: "Calculate heart rate training zones. Provide either max_hr or lthr (lactate threshold heart rate).",
            inputSchema: [
                "type": "object",
                "properties": .object([
                    "max_hr": .object(["type": "integer", "description": "Maximum heart rate in bpm"]),
                    "lthr": .object(["type": "integer", "description": "Lactate threshold heart rate in bpm"]),
                ]),
                "required": .array([]),
            ]
        ),
        ToolDef(
            name: "check_mileage_progression",
            description: "Validate weekly volume progression for safety. Flags any week-to-week increase greater than 10%, with exceptions for recovery weeks. Use weekly_distances_km for distance-based plans or weekly_durations_minutes for time-based plans.",
            inputSchema: [
                "type": "object",
                "properties": .object([
                    "weekly_distances_km": .object([
                        "type": "array",
                        "items": .object(["type": "number"]),
                        "description": "Array of weekly distances in km, in chronological order. Use for distance-based plans.",
                    ]),
                    "weekly_durations_minutes": .object([
                        "type": "array",
                        "items": .object(["type": "number"]),
                        "description": "Array of weekly durations in minutes, in chronological order. Use for time-based plans.",
                    ]),
                ]),
                "required": .array([]),
            ]
        ),
    ]
}
