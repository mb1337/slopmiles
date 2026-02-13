import Foundation

struct WeatherTool {
    static func getForecast(latitude: Double, longitude: Double, days: Int) async -> [String: JSONValue] {
        let clampedDays = min(max(days, 1), 14)
        let urlString = "https://api.open-meteo.com/v1/forecast?latitude=\(latitude)&longitude=\(longitude)&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,uv_index_max,weather_code&forecast_days=\(clampedDays)&timezone=auto"

        guard let url = URL(string: urlString) else {
            return ["error": "Invalid URL"]
        }

        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let daily = json["daily"] as? [String: Any],
                  let dates = daily["time"] as? [String],
                  let tempMaxs = daily["temperature_2m_max"] as? [Double],
                  let tempMins = daily["temperature_2m_min"] as? [Double],
                  let precipProbs = daily["precipitation_probability_max"] as? [Int],
                  let windSpeeds = daily["wind_speed_10m_max"] as? [Double],
                  let uvIndices = daily["uv_index_max"] as? [Double],
                  let weatherCodes = daily["weather_code"] as? [Int] else {
                return ["error": "Failed to parse weather response"]
            }

            var forecasts: [JSONValue] = []
            for i in 0..<dates.count {
                forecasts.append(.object([
                    "date": .string(dates[i]),
                    "temp_high_c": .number(tempMaxs[i]),
                    "temp_low_c": .number(tempMins[i]),
                    "precipitation_probability_pct": .int(precipProbs[i]),
                    "wind_speed_kmh": .number(windSpeeds[i]),
                    "condition": .string(weatherCondition(from: weatherCodes[i])),
                    "uv_index": .number(uvIndices[i]),
                ]))
            }

            return ["daily": .array(forecasts)]
        } catch {
            return ["error": .string("Weather fetch failed: \(error.localizedDescription)")]
        }
    }

    private static func weatherCondition(from code: Int) -> String {
        switch code {
        case 0: return "Clear sky"
        case 1: return "Mainly clear"
        case 2: return "Partly cloudy"
        case 3: return "Overcast"
        case 45, 48: return "Fog"
        case 51, 53, 55: return "Drizzle"
        case 56, 57: return "Freezing drizzle"
        case 61, 63, 65: return "Rain"
        case 66, 67: return "Freezing rain"
        case 71, 73, 75: return "Snow"
        case 77: return "Snow grains"
        case 80, 81, 82: return "Rain showers"
        case 85, 86: return "Snow showers"
        case 95: return "Thunderstorm"
        case 96, 99: return "Thunderstorm with hail"
        default: return "Unknown"
        }
    }
}
