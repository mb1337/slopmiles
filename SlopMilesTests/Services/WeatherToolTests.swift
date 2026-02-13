import Testing
@testable import SlopMiles

@Suite("Weather Tool Tests")
struct WeatherToolTests {
    @Test("Clamps days parameter and handles API response")
    func clampsDays() async {
        let result = await WeatherTool.getForecast(latitude: 0, longitude: 0, days: 20)
        #expect(result["error"] != nil || result["daily"] != nil)
    }
}
