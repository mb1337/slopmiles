import XCTest

final class TabNavigationTests: SlopMilesUITestCase {

    func testTabNavigation() {
        launchWithSampleData()

        // Dashboard is default
        XCTAssertTrue(app.navigationBars["Dashboard"].waitForExistence(timeout: 5))

        // Plans tab
        app.tabBars.buttons["Plans"].tap()
        XCTAssertTrue(app.navigationBars["Plans"].waitForExistence(timeout: 3))

        // Coach tab
        app.tabBars.buttons["Coach"].tap()
        XCTAssertTrue(app.navigationBars["Coach"].waitForExistence(timeout: 3))

        // History tab
        app.tabBars.buttons["History"].tap()
        XCTAssertTrue(app.navigationBars["History"].waitForExistence(timeout: 3))

        // Settings tab
        app.tabBars.buttons["Settings"].tap()
        XCTAssertTrue(app.navigationBars["Settings"].waitForExistence(timeout: 3))
    }
}
