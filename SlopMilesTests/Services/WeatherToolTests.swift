import Testing
@testable import SlopMiles

@Suite("Weather Tool Tests")
struct WeatherToolTests {
    @Test("Clamps days parameter and returns well-formed forecast")
    func clampsDaysAndValidatesResponse() async {
        // days=20 should be clamped to 14; response should still be valid
        let result = await WeatherTool.getForecast(latitude: 40.7128, longitude: -74.0060, days: 20)

        if let error = result["error"] {
            // If there's a network error, that's acceptable for a real network test,
            // but verify the error is a meaningful string
            let errorMsg = error.stringValue!
            #expect(!errorMsg.isEmpty, "Error message should not be empty")
        } else {
            // Verify daily is a non-empty array
            let daily = result["daily"]!.arrayValue!
            #expect(!daily.isEmpty, "Forecast should contain at least one day")
            // Clamped to 14, so should have at most 14 entries
            #expect(daily.count <= 14, "Clamped to 14 days, got \(daily.count)")

            // Verify each forecast entry has required keys with correct types
            let firstDay = daily[0].objectValue!
            #expect(firstDay["date"]!.stringValue != nil, "Forecast entry should have a date string")
            #expect(firstDay["temp_high_c"]!.doubleValue != nil, "Forecast entry should have temp_high_c")
            #expect(firstDay["temp_low_c"]!.doubleValue != nil, "Forecast entry should have temp_low_c")
            #expect(firstDay["precipitation_probability_pct"]!.intValue != nil, "Forecast entry should have precipitation_probability_pct")
            #expect(firstDay["wind_speed_kmh"]!.doubleValue != nil, "Forecast entry should have wind_speed_kmh")
            #expect(firstDay["condition"]!.stringValue != nil, "Forecast entry should have condition")
            #expect(firstDay["uv_index"]!.doubleValue != nil, "Forecast entry should have uv_index")

            // Verify date format looks like YYYY-MM-DD
            let dateStr = firstDay["date"]!.stringValue!
            #expect(dateStr.count == 10, "Date should be in YYYY-MM-DD format, got \(dateStr)")
            #expect(dateStr.contains("-"), "Date should contain dashes")

            // Verify temperature values are in a physically plausible range (-90 to 60 C)
            let tempHigh = firstDay["temp_high_c"]!.doubleValue!
            let tempLow = firstDay["temp_low_c"]!.doubleValue!
            #expect(tempHigh >= -90 && tempHigh <= 60, "Temp high should be plausible, got \(tempHigh)")
            #expect(tempLow >= -90 && tempLow <= 60, "Temp low should be plausible, got \(tempLow)")
            #expect(tempHigh >= tempLow, "High temp should be >= low temp")

            // Verify precipitation probability is 0-100
            let precip = firstDay["precipitation_probability_pct"]!.intValue!
            #expect(precip >= 0 && precip <= 100, "Precipitation probability should be 0-100, got \(precip)")
        }
    }

    @Test("Single day forecast returns exactly one entry")
    func singleDayForecast() async {
        let result = await WeatherTool.getForecast(latitude: 40.7128, longitude: -74.0060, days: 1)

        if result["error"] == nil {
            let daily = result["daily"]!.arrayValue!
            #expect(daily.count == 1, "Requesting 1 day should return 1 entry, got \(daily.count)")
        }
    }
}
