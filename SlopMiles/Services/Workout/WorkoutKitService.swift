import Foundation
import WorkoutKit

@Observable
@MainActor
final class WorkoutKitService {
    var isAuthorized = false
    var authorizationError: String?

    func requestAuthorization() async {
        var status = await Self.fetchAuthorizationState()

        if status == .notDetermined {
            await Self.performAuthorizationRequest()
            status = await Self.fetchAuthorizationState()
        }

        switch status {
        case .authorized:
            isAuthorized = true
        default:
            isAuthorized = false
            if status != .notDetermined {
                authorizationError = "WorkoutKit authorization denied. Enable in Settings > Privacy > Health."
            }
        }
    }

    private nonisolated static func fetchAuthorizationState() async -> WorkoutScheduler.AuthorizationState {
        await WorkoutScheduler.shared.authorizationState
    }

    private nonisolated static func performAuthorizationRequest() async {
        await WorkoutScheduler.shared.requestAuthorization()
    }

    func scheduleWorkout(_ workout: PlannedWorkout) async throws {
        let custom = WorkoutMapper.mapToCustomWorkout(workout)
        let plan = WorkoutPlan(.custom(custom))

        let dateComponents = Calendar.current.dateComponents(
            [.year, .month, .day, .hour, .minute],
            from: workout.scheduledDate
        )

        await WorkoutScheduler.shared.schedule(plan, at: dateComponents)
        workout.completionStatus = .scheduled
    }

    func removeScheduledWorkout(_ workout: PlannedWorkout) async throws {
        let custom = WorkoutMapper.mapToCustomWorkout(workout)
        let plan = WorkoutPlan(.custom(custom))

        let dateComponents = Calendar.current.dateComponents(
            [.year, .month, .day, .hour, .minute],
            from: workout.scheduledDate
        )

        try await Self.unscheduleWorkout(plan, at: dateComponents)

        workout.completionStatus = .planned
        workout.watchScheduleID = nil
    }

    private nonisolated static func unscheduleWorkout(_ plan: WorkoutPlan, at dateComponents: DateComponents) async throws {
        try await WorkoutScheduler.shared.remove(plan, at: dateComponents)
    }

    func scheduleWeek(_ week: TrainingWeek) async throws {
        for workout in week.sortedWorkouts where workout.workoutType != .rest {
            try await scheduleWorkout(workout)
        }
    }

    enum WorkoutKitError: Error, LocalizedError {
        case mappingFailed
        case schedulingFailed(String)
        case notAuthorized

        var errorDescription: String? {
            switch self {
            case .mappingFailed: return "Failed to convert workout to WorkoutKit format."
            case .schedulingFailed(let msg): return "Scheduling failed: \(msg)"
            case .notAuthorized: return "WorkoutKit is not authorized."
            }
        }
    }
}
