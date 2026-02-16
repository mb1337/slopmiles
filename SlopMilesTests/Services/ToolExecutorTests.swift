import Testing
@testable import SlopMiles

@Suite("Tool Executor Tests")
struct ToolExecutorTests {
    let executor = ToolExecutor()

    @Test("Routes calculate_vdot correctly")
    func routesVDOT() async {
        let call = ToolCall(id: "1", name: "calculate_vdot", arguments: [
            "race_distance_meters": .number(5000.0), "race_time_seconds": .number(1200.0),
        ])
        let result = await executor.execute(call)
        #expect(result.toolCallId == "1")
        #expect(result.result["vdot"] != nil)
    }

    @Test("Routes calculate_hr_zones correctly")
    func routesHRZones() async {
        let call = ToolCall(id: "3", name: "calculate_hr_zones", arguments: ["max_hr": .int(190)])
        let result = await executor.execute(call)
        #expect(result.result["zone1"] != nil)
    }

    @Test("Routes check_mileage_progression correctly")
    func routesMileage() async {
        let call = ToolCall(id: "5", name: "check_mileage_progression", arguments: [
            "weekly_distances_km": .array([.number(30.0), .number(33.0), .number(36.0)]),
        ])
        let result = await executor.execute(call)
        #expect(result.result["safe"] != nil)
    }

    @Test("Unknown tool returns error")
    func unknownTool() async {
        let call = ToolCall(id: "6", name: "nonexistent_tool", arguments: [:])
        let result = await executor.execute(call)
        #expect(result.result["error"] != nil)
    }

    @Test("Removed tools return unknown error")
    func removedToolsReturnError() async {
        let paceCall = ToolCall(id: "7", name: "get_training_paces", arguments: ["vdot": .number(50.0)])
        let paceResult = await executor.execute(paceCall)
        #expect(paceResult.result["error"] != nil)

        let convertCall = ToolCall(id: "8", name: "convert_pace", arguments: [
            "value": .number(5.0), "from_unit": .string("min_per_km"), "to_unit": .string("min_per_mile"),
        ])
        let convertResult = await executor.execute(convertCall)
        #expect(convertResult.result["error"] != nil)
    }

    @Test("Execute all runs in parallel")
    func executeAll() async {
        let calls = [
            ToolCall(id: "a", name: "calculate_vdot", arguments: ["race_distance_meters": .number(5000.0), "race_time_seconds": .number(1200.0)]),
            ToolCall(id: "b", name: "check_mileage_progression", arguments: ["weekly_distances_km": .array([.number(30.0), .number(35.0)])]),
        ]
        let results = await executor.executeAll(calls)
        #expect(results.count == 2)
        #expect(results[0].toolCallId == "a")
        #expect(results[1].toolCallId == "b")
    }

    @Test("Tool result JSON serialization")
    func jsonSerialization() async {
        let call = ToolCall(id: "7", name: "calculate_vdot", arguments: [
            "race_distance_meters": .number(5000.0), "race_time_seconds": .number(1200.0),
        ])
        let result = await executor.execute(call)
        #expect(result.jsonString.contains("vdot"))
    }
}
