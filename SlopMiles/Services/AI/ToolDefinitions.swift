import Foundation

struct ToolDefinitions {
    static func anthropicTools() -> [[String: Any]] {
        tools.map { tool in
            [
                "name": tool.name,
                "description": tool.description,
                "input_schema": tool.inputSchema,
            ]
        }
    }

    static func openAITools() -> [[String: Any]] {
        tools.map { tool in
            [
                "type": "function",
                "function": [
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.inputSchema,
                ] as [String: Any],
            ]
        }
    }

    struct ToolDef: @unchecked Sendable {
        let name: String
        let description: String
        let inputSchema: [String: Any]
    }

    static let tools: [ToolDef] = [
        ToolDef(
            name: "calculate_vdot",
            description: "Calculate VDOT fitness score from a race result. VDOT is Jack Daniels' measure of running fitness based on race performance.",
            inputSchema: [
                "type": "object",
                "properties": [
                    "race_distance_meters": ["type": "number", "description": "Race distance in meters (e.g., 5000, 10000, 21097.5, 42195)"],
                    "race_time_seconds": ["type": "number", "description": "Race finish time in seconds"],
                ] as [String: Any],
                "required": ["race_distance_meters", "race_time_seconds"],
            ]
        ),
        ToolDef(
            name: "get_training_paces",
            description: "Get all 5 training paces (easy, marathon, threshold, interval, repetition) for a given VDOT value. Returns paces in min/km.",
            inputSchema: [
                "type": "object",
                "properties": [
                    "vdot": ["type": "number", "description": "VDOT fitness score"],
                ] as [String: Any],
                "required": ["vdot"],
            ]
        ),
        ToolDef(
            name: "project_race_time",
            description: "Predict finish time for a race distance based on VDOT.",
            inputSchema: [
                "type": "object",
                "properties": [
                    "vdot": ["type": "number", "description": "VDOT fitness score"],
                    "distance_meters": ["type": "number", "description": "Target race distance in meters"],
                ] as [String: Any],
                "required": ["vdot", "distance_meters"],
            ]
        ),
        ToolDef(
            name: "calculate_hr_zones",
            description: "Calculate heart rate training zones. Provide either max_hr or lthr (lactate threshold heart rate).",
            inputSchema: [
                "type": "object",
                "properties": [
                    "max_hr": ["type": "integer", "description": "Maximum heart rate in bpm"],
                    "lthr": ["type": "integer", "description": "Lactate threshold heart rate in bpm"],
                ] as [String: Any],
                "required": [] as [String],
            ]
        ),
        ToolDef(
            name: "convert_pace",
            description: "Convert between pace and speed units: min_per_km, min_per_mile, km_per_hour, mph.",
            inputSchema: [
                "type": "object",
                "properties": [
                    "value": ["type": "number", "description": "The value to convert"],
                    "from_unit": ["type": "string", "enum": ["min_per_km", "min_per_mile", "km_per_hour", "mph"]],
                    "to_unit": ["type": "string", "enum": ["min_per_km", "min_per_mile", "km_per_hour", "mph"]],
                ] as [String: Any],
                "required": ["value", "from_unit", "to_unit"],
            ]
        ),
        ToolDef(
            name: "check_mileage_progression",
            description: "Validate weekly mileage progression for safety. Flags any week-to-week increase greater than 10%, with exceptions for recovery weeks.",
            inputSchema: [
                "type": "object",
                "properties": [
                    "weekly_distances_km": [
                        "type": "array",
                        "items": ["type": "number"],
                        "description": "Array of weekly distances in km, in chronological order",
                    ] as [String: Any],
                ] as [String: Any],
                "required": ["weekly_distances_km"],
            ]
        ),
        ToolDef(
            name: "get_weather_forecast",
            description: "Get weather forecast for a location. Use to schedule indoor vs outdoor workouts and adjust paces for conditions.",
            inputSchema: [
                "type": "object",
                "properties": [
                    "latitude": ["type": "number", "description": "Latitude of the location"],
                    "longitude": ["type": "number", "description": "Longitude of the location"],
                    "days": ["type": "integer", "description": "Number of forecast days (1-14)", "minimum": 1, "maximum": 14],
                ] as [String: Any],
                "required": ["latitude", "longitude", "days"],
            ]
        ),
    ]
}
