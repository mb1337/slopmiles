import Foundation

struct ToolCall: @unchecked Sendable {
    let id: String
    let name: String
    let arguments: [String: Any]
}

struct ToolResult: @unchecked Sendable {
    let toolCallId: String
    let result: [String: Any]

    var jsonString: String {
        guard let data = try? JSONSerialization.data(withJSONObject: result, options: .sortedKeys),
              let string = String(data: data, encoding: .utf8) else {
            return "{\"error\": \"Failed to serialize result\"}"
        }
        return string
    }
}

actor ToolExecutor {
    func execute(_ toolCall: ToolCall) async -> ToolResult {
        let result: [String: Any]

        switch toolCall.name {
        case "calculate_vdot":
            let distance = toolCall.arguments["race_distance_meters"] as? Double ?? 0
            let time = toolCall.arguments["race_time_seconds"] as? Double ?? 0
            result = VDOTTool.calculateVDOT(raceDistanceMeters: distance, raceTimeSeconds: time)

        case "get_training_paces":
            let vdot = toolCall.arguments["vdot"] as? Double ?? 0
            result = VDOTTool.getTrainingPaces(vdot: vdot)

        case "project_race_time":
            let vdot = toolCall.arguments["vdot"] as? Double ?? 0
            let distance = toolCall.arguments["distance_meters"] as? Double ?? 0
            result = VDOTTool.projectRaceTime(vdot: vdot, distanceMeters: distance)

        case "calculate_hr_zones":
            let maxHR = (toolCall.arguments["max_hr"] as? NSNumber)?.intValue
            let lthr = (toolCall.arguments["lthr"] as? NSNumber)?.intValue
            result = HeartRateZoneTool.calculateZones(maxHR: maxHR, lthr: lthr)

        case "convert_pace":
            let value = toolCall.arguments["value"] as? Double ?? 0
            let fromUnit = toolCall.arguments["from_unit"] as? String ?? ""
            let toUnit = toolCall.arguments["to_unit"] as? String ?? ""
            result = PaceConverterTool.convert(value: value, from: fromUnit, to: toUnit)

        case "check_mileage_progression":
            let distances = toolCall.arguments["weekly_distances_km"] as? [Double] ?? []
            result = MileageProgressionTool.check(weeklyDistancesKm: distances)

        case "get_weather_forecast":
            let lat = toolCall.arguments["latitude"] as? Double ?? 0
            let lon = toolCall.arguments["longitude"] as? Double ?? 0
            let days = (toolCall.arguments["days"] as? NSNumber)?.intValue ?? 7
            result = await WeatherTool.getForecast(latitude: lat, longitude: lon, days: days)

        default:
            result = ["error": "Unknown tool: \(toolCall.name)"]
        }

        return ToolResult(toolCallId: toolCall.id, result: result)
    }

    func executeAll(_ toolCalls: [ToolCall]) async -> [ToolResult] {
        await withTaskGroup(of: ToolResult.self) { group in
            for call in toolCalls {
                group.addTask {
                    await self.execute(call)
                }
            }
            var results: [ToolResult] = []
            for await result in group {
                results.append(result)
            }
            let idOrder = toolCalls.map(\.id)
            return results.sorted { a, b in
                (idOrder.firstIndex(of: a.toolCallId) ?? 0) < (idOrder.firstIndex(of: b.toolCallId) ?? 0)
            }
        }
    }
}
