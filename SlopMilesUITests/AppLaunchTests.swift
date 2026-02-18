import XCTest

final class AppLaunchTests: SlopMilesUITestCase {

    func testAppLaunchShowsAllTabs() {
        launchWithSampleData()

        XCTAssertTrue(app.tabBars.buttons["Dashboard"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.tabBars.buttons["Plans"].exists)
        XCTAssertTrue(app.tabBars.buttons["Coach"].exists)
        XCTAssertTrue(app.tabBars.buttons["History"].exists)
        XCTAssertTrue(app.tabBars.buttons["Settings"].exists)

        // Dashboard should be the initially selected tab
        XCTAssertTrue(app.tabBars.buttons["Dashboard"].isSelected)
    }
}
