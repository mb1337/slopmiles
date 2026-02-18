import XCTest

final class OnboardingFlowTests: SlopMilesUITestCase {

    func testOnboardingWelcomeScreen() {
        launchOnboarding()

        XCTAssertTrue(app.staticTexts["Slop Miles"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Your AI Running Coach"].exists)

        let getStarted = app.buttons.matching(identifier: "onboarding_get_started").firstMatch
        XCTAssertTrue(getStarted.exists)
    }

    func testOnboardingStepProgression() {
        launchOnboarding()

        XCTAssertTrue(app.staticTexts["Slop Miles"].waitForExistence(timeout: 5))

        // Tap Get Started to advance to API Key step
        app.buttons.matching(identifier: "onboarding_get_started").firstMatch.tap()
        XCTAssertTrue(app.staticTexts["AI Provider"].waitForExistence(timeout: 3))
    }

    func testOnboardingBackButton() {
        launchOnboarding()

        XCTAssertTrue(app.staticTexts["Slop Miles"].waitForExistence(timeout: 5))

        // Advance to API Key step
        app.buttons.matching(identifier: "onboarding_get_started").firstMatch.tap()
        XCTAssertTrue(app.staticTexts["AI Provider"].waitForExistence(timeout: 3))

        // Go back
        app.buttons.matching(identifier: "onboarding_back_button").firstMatch.tap()
        XCTAssertTrue(app.staticTexts["Slop Miles"].waitForExistence(timeout: 3))
    }

    func testOnboardingAPIKeyStepElements() {
        launchOnboarding()

        // Welcome → Get Started
        XCTAssertTrue(app.staticTexts["Slop Miles"].waitForExistence(timeout: 5))
        app.buttons.matching(identifier: "onboarding_get_started").firstMatch.tap()

        // API Key step elements
        XCTAssertTrue(app.staticTexts["AI Provider"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["Validate & Save"].exists)

        // Continue is disabled without a validated key
        let continueButton = app.buttons["Continue"]
        XCTAssertTrue(continueButton.exists)
        XCTAssertFalse(continueButton.isEnabled)
    }
}
