# Slop Miles

AI-powered running coach iOS app. BYOK (Anthropic/OpenAI/OpenRouter). AI uses tool calling for deterministic running math. Structured workouts push to Apple Watch via WorkoutKit.

## Build & Test

```bash
xcodegen generate
xcodebuild build -project SlopMiles.xcodeproj -scheme SlopMiles \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.2'
xcodebuild test -project SlopMiles.xcodeproj -scheme SlopMiles \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.2' \
  -only-testing:SlopMilesTests
xcodebuild test -project SlopMiles.xcodeproj -scheme SlopMiles \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.2' \
  -only-testing:SlopMilesUITests
```

## Tech Stack

- **Swift 6.0** strict concurrency, **SwiftUI**, **SwiftData** + CloudKit, **iOS 18.0+**
- **XcodeGen** — `project.yml` is source of truth, not `.xcodeproj`
- **WorkoutKit** (Apple Watch), **HealthKit** (running history), **CoreLocation** (weather)
- **SPM dependency:** `VDotCalculator` (`import VDotCalculator`, main type `Vdot`)
- **Swift Testing** (`@Suite`, `@Test`, `#expect`) — not XCTest
- Uses `URLSession` directly for AI APIs (no third-party AI SDKs)

## Architecture

- **SwiftData models** use raw-value-backed enums for CloudKit compat. All properties have defaults. No `@Attribute(.unique)`.
- **`JSONValue`** enum (in `AIProvider.swift`) — `Sendable` replacement for `[String: Any]`. Used for all tool args/results/definitions. Convert back via `.anyValue`.
- **`@Observable` + `@MainActor`** for stateful services. `struct` for stateless. `actor` for `CoachingToolExecutor`.
- **`AIProvider` protocol** abstracts Anthropic/OpenAI/OpenRouter. Everything outside provider files uses the protocol.
- **API keys** in iOS Keychain (never synced via CloudKit).
- **WorkoutKit**: Use `HKWorkoutSessionLocationType`, `WorkoutPlan` + `WorkoutScheduler.shared.schedule(_:at:)`.
