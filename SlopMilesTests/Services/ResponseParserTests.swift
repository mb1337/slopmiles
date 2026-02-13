import Testing
import Foundation
@testable import SlopMiles

@Suite("Response Parser Tests")
struct ResponseParserTests {
    @Test("Extract JSON from plain text")
    func extractJSONPlain() throws {
        let text = """
        {"name": "Test Plan", "weeks": []}
        """
        let json = try ResponseParser.extractJSON(from: text)
        let dict = json as! [String: Any]
        #expect(dict["name"] as! String == "Test Plan")
    }

    @Test("Extract JSON from markdown code block")
    func extractJSONFromCodeBlock() throws {
        let text = """
        Here is the plan:
        ```json
        {"name": "Test Plan", "weeks": []}
        ```
        """
        let json = try ResponseParser.extractJSON(from: text)
        let dict = json as! [String: Any]
        #expect(dict["name"] as! String == "Test Plan")
    }

    @Test("Extract JSON with surrounding text")
    func extractJSONWithSurroundingText() throws {
        let text = """
        Based on your profile, here is your plan:
        {"name": "Marathon Plan", "weeks": [{"week_number": 1, "theme": "Base", "total_distance_km": 30, "notes": "", "workouts": []}]}
        Hope this helps!
        """
        let json = try ResponseParser.extractJSON(from: text)
        let dict = json as! [String: Any]
        #expect(dict["name"] as! String == "Marathon Plan")
    }

    @Test("Throws on no JSON")
    func throwsOnNoJSON() {
        #expect(throws: ResponseParser.ParseError.self) {
            try ResponseParser.extractJSON(from: "No JSON here at all")
        }
    }

    @Test("Parse workout from dictionary")
    func parseWorkout() {
        let dict: [String: Any] = [
            "name": "Easy Run", "type": "easy", "day_of_week": 2,
            "distance_km": 8.0, "duration_minutes": 48.0,
            "target_pace_min_per_km": 6.0, "location": "outdoor", "notes": "Keep it easy",
        ]
        let workout = ResponseParser.parseWorkout(from: dict, weekNumber: 1, planStartDate: Date(), calendar: Calendar.current)
        #expect(workout.name == "Easy Run")
        #expect(workout.workoutType == .easy)
        #expect(workout.distanceKm == 8.0)
        #expect(workout.targetPaceMinPerKm == 6.0)
        #expect(workout.location == .outdoor)
    }

    @Test("Parse step from dictionary")
    func parseStep() {
        let dict: [String: Any] = [
            "type": "work", "name": "800m repeat", "goal_type": "distance",
            "goal_value": 800.0, "target_pace_min_per_km": 4.2, "hr_zone": 4, "repeat_count": 6,
        ]
        let step = ResponseParser.parseStep(from: dict, order: 0)
        #expect(step.stepType == .work)
        #expect(step.name == "800m repeat")
        #expect(step.goalType == .distance)
        #expect(step.goalValue == 800.0)
        #expect(step.repeatCount == 6)
        #expect(step.hrZone == 4)
    }

    @Test("Parse step defaults for missing fields")
    func parseStepDefaults() {
        let step = ResponseParser.parseStep(from: [:], order: 3)
        #expect(step.order == 3)
        #expect(step.stepType == .work)
        #expect(step.goalType == .open)
        #expect(step.repeatCount == 1)
    }
}
