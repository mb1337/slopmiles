import ExpoModulesCore
import Foundation

public class SlopMilesHealthKitBridgeModule: Module {
  private var pendingSyncObserver: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("SlopMilesHealthKitBridge")

    Events("onPendingWorkoutSync")

    OnStartObserving {
      pendingSyncObserver = NotificationCenter.default.addObserver(
        forName: .slopMilesPendingWorkoutSyncUpdated,
        object: nil,
        queue: .main
      ) { [weak self] _ in
        self?.emitPendingWorkoutSyncIfNeeded()
      }

      emitPendingWorkoutSyncIfNeeded()
    }

    OnStopObserving {
      if let pendingSyncObserver {
        NotificationCenter.default.removeObserver(pendingSyncObserver)
        self.pendingSyncObserver = nil
      }
    }

    AsyncFunction("ensureBackgroundSyncRegistered") { () async -> [String: Any] in
      return await withCheckedContinuation { continuation in
        SlopMilesHealthKitBackgroundManager.shared.ensureBackgroundDeliveryRegistered { enabled, reason in
          continuation.resume(returning: [
            "enabled": enabled,
            "reason": reason as Any,
          ])
        }
      }
    }

    AsyncFunction("primeBackgroundSyncAfterBackfill") { (backfillEndedAt: Double) async -> [String: Any] in
      return await withCheckedContinuation { continuation in
        SlopMilesHealthKitBackgroundManager.shared.primeBackgroundSyncAfterBackfill(
          backfillEndedAtMs: backfillEndedAt
        ) { enabled, reason in
          continuation.resume(returning: [
            "enabled": enabled,
            "reason": reason as Any,
          ])
        }
      }
    }

    AsyncFunction("getPendingWorkoutSync") { () async -> [String: Any]? in
      return await withCheckedContinuation { continuation in
        SlopMilesHealthKitBackgroundManager.shared.getPendingSync { payload in
          continuation.resume(returning: payload)
        }
      }
    }

    AsyncFunction("completePendingWorkoutSync") { (pendingSyncId: String, success: Bool) async -> Void in
      await withCheckedContinuation { continuation in
        SlopMilesHealthKitBackgroundManager.shared.completePendingSync(
          pendingSyncId: pendingSyncId,
          success: success
        ) {
          continuation.resume()
        }
      }
    }
  }

  private func emitPendingWorkoutSyncIfNeeded() {
    guard let payload = SlopMilesHealthKitBackgroundManager.shared.pendingSyncPayload() else {
      return
    }

    sendEvent("onPendingWorkoutSync", payload)
  }
}
