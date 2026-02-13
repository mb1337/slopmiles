import Foundation
import HealthKit
import WorkoutKit

struct WorkoutMapper {
    static func mapToCustomWorkout(_ workout: PlannedWorkout) -> CustomWorkout {
        let blocks = buildBlocks(from: workout.sortedSteps)

        return CustomWorkout(
            activity: .running,
            location: mapLocation(workout.location),
            displayName: workout.name,
            warmup: buildWarmup(from: workout.sortedSteps),
            blocks: blocks,
            cooldown: buildCooldown(from: workout.sortedSteps)
        )
    }

    static func mapToScheduledPlan(_ workout: PlannedWorkout) -> ScheduledWorkoutPlan? {
        let custom = mapToCustomWorkout(workout)
        let plan = WorkoutPlan(.custom(custom))

        let dateComponents = Calendar.current.dateComponents(
            [.year, .month, .day, .hour, .minute],
            from: workout.scheduledDate
        )

        return ScheduledWorkoutPlan(plan, date: dateComponents)
    }

    private static func mapLocation(_ location: WorkoutLocation) -> HKWorkoutSessionLocationType {
        switch location {
        case .outdoor, .track, .trail: return .outdoor
        case .treadmill: return .indoor
        }
    }

    private static func buildWarmup(from steps: [PlannedWorkoutStep]) -> WorkoutStep? {
        guard let warmupStep = steps.first(where: { $0.stepType == .warmup }) else { return nil }
        return mapToWorkoutStep(warmupStep)
    }

    private static func buildCooldown(from steps: [PlannedWorkoutStep]) -> WorkoutStep? {
        guard let cooldownStep = steps.last(where: { $0.stepType == .cooldown }) else { return nil }
        return mapToWorkoutStep(cooldownStep)
    }

    private static func buildBlocks(from steps: [PlannedWorkoutStep]) -> [IntervalBlock] {
        let workAndRecoverySteps = steps.filter { $0.stepType == .work || $0.stepType == .recovery }
        guard !workAndRecoverySteps.isEmpty else { return [] }

        var blocks: [IntervalBlock] = []
        var i = 0

        while i < workAndRecoverySteps.count {
            let step = workAndRecoverySteps[i]

            if step.stepType == .work {
                let workInterval = IntervalStep(.work, goal: mapGoal(step), alert: mapAlert(step))

                if i + 1 < workAndRecoverySteps.count && workAndRecoverySteps[i + 1].stepType == .recovery {
                    let recoveryStep = workAndRecoverySteps[i + 1]
                    let recoveryInterval = IntervalStep(.recovery, goal: mapGoal(recoveryStep))

                    let intervals = [workInterval, recoveryInterval]
                    blocks.append(IntervalBlock(steps: intervals, iterations: step.repeatCount))
                    i += 2
                } else {
                    blocks.append(IntervalBlock(steps: [workInterval], iterations: step.repeatCount))
                    i += 1
                }
            } else {
                i += 1
            }
        }

        return blocks
    }

    private static func mapToWorkoutStep(_ step: PlannedWorkoutStep) -> WorkoutStep {
        WorkoutStep(goal: mapGoal(step), alert: mapAlert(step))
    }

    private static func mapGoal(_ step: PlannedWorkoutStep) -> WorkoutGoal {
        switch step.goalType {
        case .distance:
            if let value = step.goalValue {
                return .distance(value, .meters)
            }
            return .open
        case .time:
            if let value = step.goalValue {
                return .time(value, .seconds)
            }
            return .open
        case .open:
            return .open
        }
    }

    private static func mapAlert(_ step: PlannedWorkoutStep) -> (any WorkoutAlert)? {
        if let pace = step.targetPaceMinPerKm {
            let metersPerSecond = 1000.0 / (pace * 60.0)
            let lowerBound = Measurement<UnitSpeed>(value: metersPerSecond * 0.95, unit: .metersPerSecond)
            let upperBound = Measurement<UnitSpeed>(value: metersPerSecond * 1.05, unit: .metersPerSecond)
            return SpeedRangeAlert(
                target: lowerBound...upperBound,
                metric: .current
            )
        }

        if let zone = step.hrZone, (1...5).contains(zone) {
            return HeartRateZoneAlert(zone: zone)
        }

        return nil
    }
}
