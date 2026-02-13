# Slop Miles

AI-powered running coach iOS app. Users bring their own OpenAI/Anthropic API key. The AI uses function calling (tool use) to invoke deterministic running calculators rather than doing math itself. Structured workouts push to Apple Watch via WorkoutKit.

## Build & Test

```bash
# Generate Xcode project (required after changing project.yml)
xcodegen generate

# Build
xcodebuild build -project SlopMiles.xcodeproj -scheme SlopMiles \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.2'

# Run tests
xcodebuild test -project SlopMiles.xcodeproj -scheme SlopMiles \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.2' \
  -only-testing:SlopMilesTests
```

## Tech Stack

- **Swift 6.0** with strict concurrency
- **SwiftUI** + **SwiftData** (with iCloud/CloudKit sync)
- **WorkoutKit** for Apple Watch workouts (no watch app target)
- **HealthKit** for reading running history
- **XcodeGen** (`project.yml` is the source of truth, not the .xcodeproj)
- **iOS 18.0+** deployment target
- **SPM dependency:** `VDotCalculator` (github.com/mb1337/vdot-calc-swift) — import as `import VDotCalculator`, main type is `Vdot`

## Project Structure

```
SlopMiles/
├── App/              # @main entry point, AppState
├── Models/           # SwiftData @Model classes + RunningStats struct
├── Services/
│   ├── AI/           # AIProvider protocol, Anthropic/OpenAI providers, AIService, PromptBuilder, ResponseParser, ToolDefinitions
│   ├── Tools/        # VDOTTool, HeartRateZoneTool, PaceConverterTool, MileageProgressionTool, WeatherTool, ToolExecutor
│   ├── Health/       # HealthKitService
│   ├── Keychain/     # KeychainService
│   └── Workout/      # WorkoutMapper, WorkoutKitService
├── Views/
│   ├── Onboarding/   # 7-step onboarding flow
│   ├── Dashboard/    # Main tab: current week, next workout
│   ├── TrainingPlan/ # Plan list, detail, AI generation
│   ├── Workout/      # Workout row and detail views
│   ├── History/      # HealthKit run history
│   ├── Settings/     # AI settings, profile
│   └── Components/   # Shared UI components
├── Utilities/        # Constants, UnitPreferences, DateFormatters
└── Resources/        # Info.plist, entitlements, Assets.xcassets
```

## Architecture Patterns

- **SwiftData models** use raw-value-backed enums for CloudKit compatibility (e.g., `workoutTypeRaw: String` with computed `workoutType: WorkoutType`). All properties have defaults. No `@Attribute(.unique)`.
- **AI tool use loop**: App sends prompt + tool definitions to LLM. LLM responds with tool calls. `ToolExecutor` (actor) runs them locally. Results sent back. Loop continues until final JSON plan. Max 10 rounds.
- **`AIProvider` protocol** abstracts Anthropic vs OpenAI. Both use `URLSession` directly (no third-party AI SDKs).
- **API keys** stored in iOS Keychain (never synced via CloudKit).
- **`@Observable` + `@MainActor`** for all services that touch UI state (AppState, AIService, HealthKitService, WorkoutKitService).
- **`ToolCall`/`ToolResult`** are `@unchecked Sendable` because `[String: Any]` is not natively Sendable.
- **WorkoutKit types**: Use `HKWorkoutSessionLocationType` (not `WorkoutLocationType`), `WorkoutPlan` + `WorkoutScheduler.shared.schedule(_:at:)`, `SpeedRangeAlert(target: ClosedRange<Measurement<UnitSpeed>>)`.

## Testing

- Uses **Swift Testing** framework (`import Testing`, `@Suite`, `@Test`, `#expect`) — not XCTest
- Tests in `SlopMilesTests/Services/` and `SlopMilesTests/Models/`
- `MockAIProvider` available for AI service testing
- WeatherToolTests makes a real network call to Open-Meteo

## Key Conventions

- No third-party dependencies except `VDotCalculator`
- Prefer `struct` for stateless services (tools, mappers, parsers)
- Prefer `final class` with `@Observable` for stateful services
- `actor` for `ToolExecutor` (concurrent tool execution)
- Keep AI provider differences isolated in `AnthropicProvider`/`OpenAIProvider` — everything else uses the `AIProvider` protocol
