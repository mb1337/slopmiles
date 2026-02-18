import XCTest

final class DashboardTests: SlopMilesUITestCase {

    func testDashboardShowsSamplePlan() {
        launchWithSampleData()

        XCTAssertTrue(app.navigationBars["Dashboard"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Half Marathon Training"].waitForExistence(timeout: 3))
    }

    func testDashboardEmptyState() {
        launchEmpty()

        XCTAssertTrue(app.navigationBars["Dashboard"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["No Active Plan"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["Create Plan"].exists)
    }
}
