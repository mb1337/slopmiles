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
            name: "get_training_paces",
            description: "Get all 5 training paces (easy, marathon, threshold, interval, repetition) for a given VDOT value. Returns paces in min/km.",
            inputSchema: [
                "type": "object",
                "properties": .object([
                    "vdot": .object(["type": "number", "description": "VDOT fitness score"]),
                ]),
                "required": .array([.string("vdot")]),
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
            name: "convert_pace",
            description: "Convert between pace and speed units: min_per_km, min_per_mile, km_per_hour, mph.",
            inputSchema: [
                "type": "object",
                "properties": .object([
                    "value": .object(["type": "number", "description": "The value to convert"]),
                    "from_unit": .object(["type": "string", "enum": .array([.string("min_per_km"), .string("min_per_mile"), .string("km_per_hour"), .string("mph")])]),
                    "to_unit": .object(["type": "string", "enum": .array([.string("min_per_km"), .string("min_per_mile"), .string("km_per_hour"), .string("mph")])]),
                ]),
                "required": .array([.string("value"), .string("from_unit"), .string("to_unit")]),
            ]
        ),
        ToolDef(
            name: "check_mileage_progression",
            description: "Validate weekly mileage progression for safety. Flags any week-to-week increase greater than 10%, with exceptions for recovery weeks.",
            inputSchema: [
                "type": "object",
                "properties": .object([
                    "weekly_distances_km": .object([
                        "type": "array",
                        "items": .object(["type": "number"]),
                        "description": "Array of weekly distances in km, in chronological order",
                    ]),
                ]),
                "required": .array([.string("weekly_distances_km")]),
            ]
        ),
        ToolDef(
            name: "get_weather_forecast",
            description: "Get weather forecast for a location. Use to schedule indoor vs outdoor workouts and adjust paces for conditions.",
            inputSchema: [
                "type": "object",
                "properties": .object([
                    "latitude": .object(["type": "number", "description": "Latitude of the location"]),
                    "longitude": .object(["type": "number", "description": "Longitude of the location"]),
                    "days": .object(["type": "integer", "description": "Number of forecast days (1-14)", "minimum": 1, "maximum": 14]),
                ]),
                "required": .array([.string("latitude"), .string("longitude"), .string("days")]),
            ]
        ),
    ]
}
