import XCTest

class SlopMilesUITestCase: XCTestCase {

    var app: XCUIApplication!

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
        app = XCUIApplication()
    }

    /// Launch with sample data and onboarding skipped — shows main tab view.
    func launchWithSampleData() {
        app.launchArguments = ["--uitesting", "--skip-onboarding", "--with-sample-data"]
        app.launch()
    }

    /// Launch with onboarding skipped but no sample data — shows empty states.
    func launchEmpty() {
        app.launchArguments = ["--uitesting", "--skip-onboarding"]
        app.launch()
    }

    /// Launch without skipping onboarding — shows onboarding flow.
    func launchOnboarding() {
        app.launchArguments = ["--uitesting"]
        app.launch()
    }
}
