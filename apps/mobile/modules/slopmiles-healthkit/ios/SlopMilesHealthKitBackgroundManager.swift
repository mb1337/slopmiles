import Foundation
import HealthKit

extension Notification.Name {
  static let slopMilesPendingWorkoutSyncUpdated = Notification.Name("SlopMilesPendingWorkoutSyncUpdated")
}

struct SlopMilesPendingWorkoutSyncRecord: Codable {
  let pendingSyncId: String
  let workoutExternalIds: [String]
  let deletedWorkoutExternalIds: [String]
  let detectedAt: Double
  let candidateAnchor: String

  func asModulePayload() -> [String: Any] {
    return [
      "pendingSyncId": pendingSyncId,
      "workoutExternalIds": workoutExternalIds,
      "detectedAt": Int(detectedAt.rounded()),
    ]
  }
}

final class SlopMilesHealthKitBackgroundManager {
  static let shared = SlopMilesHealthKitBackgroundManager()
  private static let initialLookbackDays = 84
  private static let initialBackfillRequiredReason =
    "Complete the initial 12-week HealthKit backfill to enable automatic background sync."

  private let healthStore = HKHealthStore()
  private let queue = DispatchQueue(label: "com.slopmiles.healthkit.background-sync")
  private let committedAnchorKey = "SlopMilesHealthKitCommittedWorkoutAnchor"
  private let pendingSyncKey = "SlopMilesHealthKitPendingWorkoutSync"
  private let userDefaults = UserDefaults.standard

  private var observerQuery: HKObserverQuery?

  private init() {}

  func ensureBackgroundDeliveryRegistered(completion: @escaping (Bool, String?) -> Void) {
    guard HKHealthStore.isHealthDataAvailable() else {
      completion(false, "Health data is unavailable on this device.")
      return
    }

    queue.async {
      guard self.hasCommittedAnchor() else {
        completion(false, Self.initialBackfillRequiredReason)
        return
      }

      if self.observerQuery == nil {
        self.registerObserverQuery()
      }

      self.enableBackgroundDelivery(completion: completion)
    }
  }

  func primeBackgroundSyncAfterBackfill(
    backfillEndedAtMs: Double,
    completion: @escaping (Bool, String?) -> Void
  ) {
    guard HKHealthStore.isHealthDataAvailable() else {
      completion(false, "Health data is unavailable on this device.")
      return
    }

    queue.async {
      if self.hasCommittedAnchor() {
        self.ensureBackgroundDeliveryRegistered(completion: completion)
        return
      }

      let backfillEndedAt = Date(timeIntervalSince1970: backfillEndedAtMs / 1000)
      let predicate = self.buildWorkoutPredicate(anchor: nil, endDate: backfillEndedAt)
      let query = HKAnchoredObjectQuery(
        type: .workoutType(),
        predicate: predicate,
        anchor: nil,
        limit: HKObjectQueryNoLimit
      ) { [weak self] _, _, _, newAnchor, error in
        guard let self else {
          completion(false, "Background sync manager was released.")
          return
        }

        if let error {
          completion(false, error.localizedDescription)
          return
        }

        guard let encodedAnchor = self.serializeAnchor(newAnchor) else {
          completion(false, "HealthKit returned an invalid workout anchor.")
          return
        }

        self.commitAnchor(encodedAnchor)
        self.userDefaults.removeObject(forKey: self.pendingSyncKey)
        if self.observerQuery == nil {
          self.registerObserverQuery()
        }
        self.enableBackgroundDelivery(completion: completion)
      }

      self.healthStore.execute(query)
    }
  }

  func getPendingSync(completion: @escaping ([String: Any]?) -> Void) {
    queue.async {
      guard self.hasCommittedAnchor() else {
        completion(nil)
        return
      }

      if let pending = self.loadPendingSync() {
        completion(pending.asModulePayload())
        return
      }

      self.collectPendingSyncIfNeeded { record, _ in
        completion(record?.asModulePayload())
      }
    }
  }

  func completePendingSync(pendingSyncId: String, success: Bool, completion: @escaping () -> Void) {
    queue.async {
      guard let pending = self.loadPendingSync(), pending.pendingSyncId == pendingSyncId else {
        completion()
        return
      }

      if success {
        self.commitAnchor(pending.candidateAnchor)
        self.userDefaults.removeObject(forKey: self.pendingSyncKey)
      }

      completion()
    }
  }

  func pendingSyncPayload() -> [String: Any]? {
    return queue.sync {
      loadPendingSync()?.asModulePayload()
    }
  }

  private func registerObserverQuery() {
    let query = HKObserverQuery(sampleType: .workoutType(), predicate: nil) { [weak self] _, completionHandler, error in
      guard let self else {
        completionHandler()
        return
      }

      if error != nil {
        completionHandler()
        return
      }

      self.queue.async {
        self.collectPendingSyncIfNeeded { _, _ in
          completionHandler()
        }
      }
    }

    observerQuery = query
    healthStore.execute(query)
  }

  private func enableBackgroundDelivery(completion: @escaping (Bool, String?) -> Void) {
    healthStore.enableBackgroundDelivery(for: .workoutType(), frequency: .immediate) { success, error in
      if let error {
        completion(false, error.localizedDescription)
        return
      }

      completion(success, success ? nil : "HealthKit background delivery could not be enabled.")
    }
  }

  private func collectPendingSyncIfNeeded(completion: @escaping (SlopMilesPendingWorkoutSyncRecord?, String?) -> Void) {
    if let pending = loadPendingSync() {
      completion(pending, nil)
      return
    }

    let anchor = deserializeAnchor(from: userDefaults.string(forKey: committedAnchorKey))
    let predicate = buildWorkoutPredicate(anchor: anchor, endDate: nil)

    let query = HKAnchoredObjectQuery(
      type: .workoutType(),
      predicate: predicate,
      anchor: anchor,
      limit: HKObjectQueryNoLimit
    ) { [weak self] _, samples, deletedSamples, newAnchor, error in
      guard let self else {
        completion(nil, "Background sync manager was released.")
        return
      }

      if let error {
        completion(nil, error.localizedDescription)
        return
      }

      guard let encodedAnchor = self.serializeAnchor(newAnchor) else {
        completion(nil, "HealthKit returned an invalid workout anchor.")
        return
      }

      let workoutIds = (samples ?? [])
        .compactMap { $0 as? HKWorkout }
        .map(\.uuid.uuidString)
      let deletedIds = (deletedSamples ?? []).map(\.uuid.uuidString)

      guard !workoutIds.isEmpty else {
        if !deletedIds.isEmpty {
          self.commitAnchor(encodedAnchor)
        }
        completion(nil, nil)
        return
      }

      let record = SlopMilesPendingWorkoutSyncRecord(
        pendingSyncId: UUID().uuidString,
        workoutExternalIds: workoutIds,
        deletedWorkoutExternalIds: deletedIds,
        detectedAt: Date().timeIntervalSince1970 * 1000,
        candidateAnchor: encodedAnchor
      )

      self.storePendingSync(record)
      completion(record, nil)
    }

    healthStore.execute(query)
  }

  private func storePendingSync(_ record: SlopMilesPendingWorkoutSyncRecord) {
    guard let encoded = try? JSONEncoder().encode(record) else {
      return
    }

    userDefaults.set(encoded, forKey: pendingSyncKey)
    NotificationCenter.default.post(name: .slopMilesPendingWorkoutSyncUpdated, object: nil)
  }

  private func commitAnchor(_ anchor: String) {
    userDefaults.set(anchor, forKey: committedAnchorKey)
  }

  private func hasCommittedAnchor() -> Bool {
    guard let committedAnchor = userDefaults.string(forKey: committedAnchorKey) else {
      return false
    }

    return !committedAnchor.isEmpty
  }

  private func buildWorkoutPredicate(anchor: HKQueryAnchor?, endDate: Date?) -> NSPredicate {
    let runningPredicate = HKQuery.predicateForWorkouts(with: .running)
    guard anchor == nil else {
      return runningPredicate
    }

    let lookbackStart = Calendar.current.date(
      byAdding: .day,
      value: -Self.initialLookbackDays,
      to: Date()
    ) ?? Date()
    let datePredicate = HKQuery.predicateForSamples(
      withStart: lookbackStart,
      end: endDate,
      options: endDate == nil ? .strictStartDate : [.strictStartDate, .strictEndDate]
    )

    return NSCompoundPredicate(andPredicateWithSubpredicates: [
      runningPredicate,
      datePredicate,
    ])
  }

  private func loadPendingSync() -> SlopMilesPendingWorkoutSyncRecord? {
    guard let data = userDefaults.data(forKey: pendingSyncKey) else {
      return nil
    }

    return try? JSONDecoder().decode(SlopMilesPendingWorkoutSyncRecord.self, from: data)
  }

  private func serializeAnchor(_ anchor: HKQueryAnchor?) -> String? {
    guard let anchor else {
      return nil
    }

    guard let data = try? NSKeyedArchiver.archivedData(withRootObject: anchor, requiringSecureCoding: true) else {
      return nil
    }

    return data.base64EncodedString()
  }

  private func deserializeAnchor(from base64String: String?) -> HKQueryAnchor? {
    guard let base64String, !base64String.isEmpty, let data = Data(base64Encoded: base64String) else {
      return nil
    }

    return try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data)
  }
}
