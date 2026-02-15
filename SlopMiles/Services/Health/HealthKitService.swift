import Foundation
import HealthKit

@Observable
@MainActor
final class HealthKitService {
    private let healthStore = HKHealthStore()
    var isAuthorized = false
    var authorizationError: String?

    private var readTypes: Set<HKObjectType> {
        [
            HKObjectType.workoutType(),
            HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning)!,
            HKObjectType.quantityType(forIdentifier: .heartRate)!,
            HKObjectType.quantityType(forIdentifier: .vo2Max)!,
            HKObjectType.quantityType(forIdentifier: .runningSpeed)!,
            HKObjectType.quantityType(forIdentifier: .restingHeartRate)!,
        ]
    }

    var isHealthKitAvailable: Bool {
        HKHealthStore.isHealthDataAvailable()
    }

    /// Restore authorization status on app launch without prompting the user.
    func restoreAuthorizationStatus() async {
        guard isHealthKitAvailable else { return }
        do {
            let status = try await healthStore.statusForAuthorizationRequest(toShare: [], read: readTypes)
            if status == .unnecessary {
                isAuthorized = true
            }
        } catch {}
    }

    func requestAuthorization() async {
        guard isHealthKitAvailable else {
            authorizationError = "HealthKit is not available on this device."
            return
        }

        do {
            try await healthStore.requestAuthorization(toShare: [], read: readTypes)
            isAuthorized = true
        } catch {
            authorizationError = error.localizedDescription
        }
    }

    func fetchRunningStats() async -> RunningStats {
        var stats = RunningStats()

        let calendar = Calendar.current
        let now = Date()
        let thirtyDaysAgo = calendar.date(byAdding: .day, value: -30, to: now)!
        let eightWeeksAgo = calendar.date(byAdding: .weekOfYear, value: -8, to: now)!

        let workouts = await fetchRunningWorkouts(from: thirtyDaysAgo, to: now)
        stats.totalRunsLast30Days = workouts.count

        if !workouts.isEmpty {
            let totalDistance = workouts.reduce(0.0) { sum, workout in
                sum + (workout.totalDistance?.doubleValue(for: .meterUnit(with: .kilo)) ?? 0)
            }
            let weeksInPeriod = max(1, Double(calendar.dateComponents([.weekOfYear], from: thirtyDaysAgo, to: now).weekOfYear ?? 4))
            stats.averageWeeklyDistanceKm = totalDistance / weeksInPeriod

            let totalDuration = workouts.reduce(0.0) { $0 + $1.duration }
            if totalDistance > 0 {
                stats.averagePaceMinPerKm = (totalDuration / 60.0) / totalDistance
            }

            stats.longestRunKm = workouts.compactMap { $0.totalDistance?.doubleValue(for: .meterUnit(with: .kilo)) }.max() ?? 0
        }

        stats.weeklyDistancesKm = await calculateWeeklyDistances(from: eightWeeksAgo, to: now)
        stats.estimatedVO2Max = await fetchLatestVO2Max()
        stats.averageHeartRate = await fetchAverageRunningHeartRate(from: thirtyDaysAgo)

        return stats
    }

    func fetchRunningWorkouts(from startDate: Date, to endDate: Date) async -> [HKWorkout] {
        let predicate = HKQuery.predicateForWorkouts(with: .running)
        let datePredicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: .strictStartDate)
        let compound = NSCompoundPredicate(andPredicateWithSubpredicates: [predicate, datePredicate])
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)

        return await withCheckedContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: HKObjectType.workoutType(),
                predicate: compound,
                limit: HKObjectQueryNoLimit,
                sortDescriptors: [sort]
            ) { _, samples, _ in
                let workouts = (samples as? [HKWorkout]) ?? []
                continuation.resume(returning: workouts)
            }
            healthStore.execute(query)
        }
    }

    private func calculateWeeklyDistances(from startDate: Date, to endDate: Date) async -> [Double] {
        let workouts = await fetchRunningWorkouts(from: startDate, to: endDate)
        let calendar = Calendar.current

        var weeklyDistances: [String: Double] = [:]
        for workout in workouts {
            let year = calendar.component(.yearForWeekOfYear, from: workout.startDate)
            let week = calendar.component(.weekOfYear, from: workout.startDate)
            let key = "\(year)-W\(week)"
            let distance = workout.totalDistance?.doubleValue(for: .meterUnit(with: .kilo)) ?? 0
            weeklyDistances[key, default: 0] += distance
        }

        var result: [Double] = []
        var date = startDate
        while date < endDate {
            let year = calendar.component(.yearForWeekOfYear, from: date)
            let week = calendar.component(.weekOfYear, from: date)
            let key = "\(year)-W\(week)"
            result.append(weeklyDistances[key] ?? 0)
            date = calendar.date(byAdding: .weekOfYear, value: 1, to: date) ?? endDate
        }

        return result
    }

    private func fetchLatestVO2Max() async -> Double? {
        guard let vo2Type = HKQuantityType.quantityType(forIdentifier: .vo2Max) else { return nil }
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)

        return await withCheckedContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: vo2Type,
                predicate: nil,
                limit: 1,
                sortDescriptors: [sort]
            ) { _, samples, _ in
                guard let sample = samples?.first as? HKQuantitySample else {
                    continuation.resume(returning: nil)
                    return
                }
                let value = sample.quantity.doubleValue(for: HKUnit(from: "ml/kg*min"))
                continuation.resume(returning: value)
            }
            healthStore.execute(query)
        }
    }

    private func fetchAverageRunningHeartRate(from startDate: Date) async -> Double? {
        guard let hrType = HKQuantityType.quantityType(forIdentifier: .heartRate) else { return nil }

        let workouts = await fetchRunningWorkouts(from: startDate, to: Date())
        guard !workouts.isEmpty else { return nil }

        let workoutPredicates = workouts.map { HKQuery.predicateForObjects(from: $0) }
        let workoutPredicate = NSCompoundPredicate(orPredicateWithSubpredicates: workoutPredicates)

        return await withCheckedContinuation { continuation in
            let query = HKStatisticsQuery(
                quantityType: hrType,
                quantitySamplePredicate: workoutPredicate,
                options: .discreteAverage
            ) { _, result, _ in
                let avg = result?.averageQuantity()?.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
                continuation.resume(returning: avg)
            }
            healthStore.execute(query)
        }
    }
}
