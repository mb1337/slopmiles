# Slop Miles

AI-powered running coach for iOS. Generate personalized training plans using Claude, GPT, or OpenRouter models, with structured workouts pushed to Apple Watch.

## Features

- **AI Training Plans** — Multi-week plans personalized to your fitness level, schedule, and goals
- **AI Coaching** — Chat with an AI coach that can read your plan, adjust workouts, and answer questions using tool-based data access
- **Deterministic Running Math** — AI uses function calling to invoke pace calculators and VDOT formulas instead of guessing
- **Apple Watch Integration** — Structured workouts with pace targets and intervals pushed via WorkoutKit
- **HealthKit Integration** — Reads running history, VO2max, and heart rate data to inform plans
- **Weather-Aware Scheduling** — Open-Meteo forecasts for indoor/outdoor workout decisions
- **iCloud Sync** — Plans sync across devices via SwiftData + CloudKit
- **Bring Your Own Key** — No backend server. API keys stored in iOS Keychain, never leave your device.

## Requirements

- iOS 18.0+
- Xcode 16.0+
- An API key from [Anthropic](https://console.anthropic.com/), [OpenAI](https://platform.openai.com/), or [OpenRouter](https://openrouter.ai/)
- Apple Watch (optional, for WorkoutKit features)

## Architecture

### AI Tool Use

Instead of asking the LLM to do running math (unreliable), Slop Miles defines tools the AI calls during plan generation and coaching:

**Plan generation** uses `PaceCalculator` (VDOT-based training paces) and `WeatherTool` (Open-Meteo forecasts) in a multi-round tool-use loop that runs entirely client-side.

**Coaching** provides 8 tools for reading and mutating plan data: `get_active_plan`, `get_week_workouts`, `update_workout`, `skip_workout`, `swap_workout_dates`, `set_week_workouts`, `get_runner_profile`, `get_running_history`.

### Data Flow

```
SwiftData (iCloud sync) ← ResponseParser ← AI JSON
                        → WorkoutMapper → WorkoutKit → Apple Watch
HealthKit → RunningStats → PromptBuilder → AI Prompt
Keychain → API Keys (device-local, never synced)
```

## Project Structure

```
SlopMiles/
├── App/              # Entry point, AppState
├── Models/           # SwiftData models + enums
├── Services/
│   ├── AI/           # AIProvider protocol, Anthropic/OpenAI/OpenRouter, plan generation, coaching, prompts, parsing
│   ├── Tools/        # PaceCalculator, WeatherTool, CoachingToolExecutor
│   ├── Health/       # HealthKitService, WorkoutMatcher
│   ├── Workout/      # WorkoutKitService, WorkoutMapper
│   ├── Location/     # LocationService
│   └── Keychain/     # KeychainService
├── Views/
│   ├── Onboarding/   # 8-step onboarding flow
│   ├── Dashboard/    # Current week, next workout
│   ├── TrainingPlan/ # Plan list, detail, generation
│   ├── Workout/      # Workout row and detail views
│   ├── Coaching/     # AI coach chat interface
│   ├── History/      # HealthKit run history
│   └── Settings/     # AI provider, profile, schedule, equipment, VDOT calculator
├── Utilities/        # Constants, Theme, UnitPreferences, DateFormatters
└── Resources/        # Info.plist, entitlements, Assets.xcassets
```

## Setup

1. Clone the repository
2. Install [XcodeGen](https://github.com/yonaskolb/XcodeGen): `brew install xcodegen`
3. Generate the Xcode project: `xcodegen generate`
4. Open `SlopMiles.xcodeproj` in Xcode
5. Set your development team in project settings
6. Build and run on a device (WorkoutKit requires real hardware)

## Testing

```bash
xcodebuild test -project SlopMiles.xcodeproj -scheme SlopMiles \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.2' \
  -only-testing:SlopMilesTests
```

Tests use the **Swift Testing** framework and cover AI service tool-use loops, pace calculations, prompt construction, response parsing, WorkoutKit mapping, and workout matching.

## License

MIT. See [LICENSE](LICENSE).
