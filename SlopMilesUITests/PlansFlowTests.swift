import XCTest

final class PlansFlowTests: SlopMilesUITestCase {

    func testPlansListShowsPlan() {
        launchWithSampleData()

        app.tabBars.buttons["Plans"].tap()
        XCTAssertTrue(app.navigationBars["Plans"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["Half Marathon Training"].waitForExistence(timeout: 3))
    }

    func testPlanDetailNavigation() {
        launchWithSampleData()

        app.tabBars.buttons["Plans"].tap()
        XCTAssertTrue(app.staticTexts["Half Marathon Training"].waitForExistence(timeout: 3))
        app.staticTexts["Half Marathon Training"].tap()

        // Plan detail view should appear with the plan name
        XCTAssertTrue(app.navigationBars["Half Marathon Training"].waitForExistence(timeout: 3))
    }

    func testGeneratePlanFormAccess() {
        launchWithSampleData()

        app.tabBars.buttons["Plans"].tap()
        XCTAssertTrue(app.navigationBars["Plans"].waitForExistence(timeout: 3))

        app.buttons.matching(identifier: "plans_add_button").firstMatch.tap()
        XCTAssertTrue(app.navigationBars["New Plan"].waitForExistence(timeout: 3))
    }
}
