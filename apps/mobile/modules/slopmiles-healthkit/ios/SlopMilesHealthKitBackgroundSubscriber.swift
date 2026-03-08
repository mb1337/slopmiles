import ExpoModulesCore
import UIKit

public class SlopMilesHealthKitBackgroundSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    SlopMilesHealthKitBackgroundManager.shared.ensureBackgroundDeliveryRegistered { _, _ in}
    return true
  }
}
