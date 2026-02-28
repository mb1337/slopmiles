# SlopMiles HealthKit Bridge Scaffold

This module folder contains an iOS bridge scaffold for HealthKit permissions.

- `ios/SlopMilesHealthKitBridgeModule.swift.template` is the starter implementation.
- During native setup, copy the template to `ios/SlopMilesHealthKitBridgeModule.swift` in the generated iOS project and wire it through Expo Modules autolinking or the native target.

The JavaScript onboarding flow already calls `NativeModules.SlopMilesHealthKitBridge.requestAuthorization()` and will gracefully fall back when the native module is not linked.
