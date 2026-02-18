import XCTest

final class SettingsTests: SlopMilesUITestCase {

    func testSettingsSections() {
        launchWithSampleData()

        app.tabBars.buttons["Settings"].tap()
        XCTAssertTrue(app.navigationBars["Settings"].waitForExistence(timeout: 3))

        // AI Provider section — Update API Key is a NavigationLink
        XCTAssertTrue(app.buttons["Update API Key"].waitForExistence(timeout: 3))
        // Profile section — rows use accessibility identifiers
        XCTAssertTrue(app.buttons.matching(identifier: "settings_profile").firstMatch.exists)
        XCTAssertTrue(app.buttons.matching(identifier: "settings_schedule").firstMatch.exists)
        XCTAssertTrue(app.buttons.matching(identifier: "settings_equipment").firstMatch.exists)
    }

    func testSettingsProfileNavigation() {
        launchWithSampleData()

        app.tabBars.buttons["Settings"].tap()
        XCTAssertTrue(app.navigationBars["Settings"].waitForExistence(timeout: 3))

        app.buttons.matching(identifier: "settings_profile").firstMatch.tap()
        XCTAssertTrue(app.navigationBars["Runner Profile"].waitForExistence(timeout: 3))
    }

    func testSettingsScheduleNavigation() {
        launchWithSampleData()

        app.tabBars.buttons["Settings"].tap()
        XCTAssertTrue(app.navigationBars["Settings"].waitForExistence(timeout: 3))

        app.buttons.matching(identifier: "settings_schedule").firstMatch.tap()
        XCTAssertTrue(app.navigationBars["Weekly Schedule"].waitForExistence(timeout: 3))
    }

    func testSettingsEquipmentNavigation() {
        launchWithSampleData()

        app.tabBars.buttons["Settings"].tap()
        XCTAssertTrue(app.navigationBars["Settings"].waitForExistence(timeout: 3))

        app.buttons.matching(identifier: "settings_equipment").firstMatch.tap()
        XCTAssertTrue(app.navigationBars["Equipment & Facilities"].waitForExistence(timeout: 3))
    }
}
