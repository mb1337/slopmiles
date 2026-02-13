import Foundation
import WorkoutKit

@Observable
@MainActor
final class WorkoutKitService {
    var isAuthorized = false
    var authorizationError: String?

    func requestAuthorization() async {
        let status = await Self.fetchAuthorizationState()
        switch status {
        case .authorized:
            isAuthorized = true
        case .notDetermined:
            isAuthorized = false
        default:
            isAuthorized = false
            authorizationError = "WorkoutKit authorization denied. Enable in Settings > Privacy > Health."
        }
    }

    private nonisolated static func fetchAuthorizationState() async -> WorkoutScheduler.AuthorizationState {
        await WorkoutScheduler.shared.authorizationState
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
        workout.completionStatus = .planned
        workout.watchScheduleID = nil
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
