import Foundation
import os

private let logger = Logger(subsystem: "com.slopmiles", category: "ai")

struct ToolCall: Sendable {
    let id: String
    let name: String
    let arguments: [String: JSONValue]
}

struct ToolResult: Sendable {
    let toolCallId: String
    let result: [String: JSONValue]

    var jsonString: String {
        let anyDict = result.mapValues(\.anyValue)
        guard let data = try? JSONSerialization.data(withJSONObject: anyDict, options: .sortedKeys),
              let string = String(data: data, encoding: .utf8) else {
            return "{\"error\": \"Failed to serialize result\"}"
        }
        return string
    }
}

actor ToolExecutor {
    func execute(_ toolCall: ToolCall) async -> ToolResult {
        let argsDescription = toolCall.arguments.keys.sorted().joined(separator: ", ")
        logger.info("Tool execute: \(toolCall.name, privacy: .public)(\(argsDescription, privacy: .public))")
        let result: [String: JSONValue]

        switch toolCall.name {
        case "calculate_vdot":
            let distance = toolCall.arguments["race_distance_meters"]?.doubleValue ?? 0
            let time = toolCall.arguments["race_time_seconds"]?.doubleValue ?? 0
            result = VDOTTool.calculateVDOT(raceDistanceMeters: distance, raceTimeSeconds: time)

        case "project_race_time":
            let vdot = toolCall.arguments["vdot"]?.doubleValue ?? 0
            let distance = toolCall.arguments["distance_meters"]?.doubleValue ?? 0
            result = VDOTTool.projectRaceTime(vdot: vdot, distanceMeters: distance)

        case "calculate_hr_zones":
            let maxHR = toolCall.arguments["max_hr"]?.intValue
            let lthr = toolCall.arguments["lthr"]?.intValue
            result = HeartRateZoneTool.calculateZones(maxHR: maxHR, lthr: lthr)

        case "check_mileage_progression":
            if let arr = toolCall.arguments["weekly_durations_minutes"]?.arrayValue {
                let durations = arr.compactMap(\.doubleValue)
                result = MileageProgressionTool.checkDuration(weeklyDurationsMinutes: durations)
            } else {
                let distances: [Double]
                if let arr = toolCall.arguments["weekly_distances_km"]?.arrayValue {
                    distances = arr.compactMap(\.doubleValue)
                } else {
                    distances = []
                }
                result = MileageProgressionTool.check(weeklyDistancesKm: distances)
            }

        default:
            result = ["error": .string("Unknown tool: \(toolCall.name)")]
        }

        let resultKeys = result.keys.sorted().joined(separator: ", ")
        logger.info("Tool result: \(toolCall.name, privacy: .public) -> keys=[\(resultKeys, privacy: .public)]")
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
