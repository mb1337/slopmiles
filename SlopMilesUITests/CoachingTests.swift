import XCTest

final class CoachingTests: SlopMilesUITestCase {

    func testCoachingInputExists() {
        launchWithSampleData()

        app.tabBars.buttons["Coach"].tap()
        XCTAssertTrue(app.navigationBars["Coach"].waitForExistence(timeout: 3))

        let input = app.textFields.matching(identifier: "coaching_message_input").firstMatch
        XCTAssertTrue(input.waitForExistence(timeout: 3))

        let sendButton = app.buttons.matching(identifier: "coaching_send_button").firstMatch
        XCTAssertTrue(sendButton.exists)
    }
}
