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

    static func isSingleSegment(_ workout: PlannedWorkout) -> Bool {
        let steps = workout.sortedSteps
        let hasWarmup = steps.contains { $0.stepType == .warmup }
        let hasCooldown = steps.contains { $0.stepType == .cooldown }
        let hasRecovery = steps.contains { $0.stepType == .recovery }
        let workSteps = steps.filter { $0.stepType == .work }
        return !hasWarmup && !hasCooldown && !hasRecovery && workSteps.count <= 1
    }

    static func mapToSingleGoalWorkout(_ workout: PlannedWorkout) -> SingleGoalWorkout {
        let workStep = workout.sortedSteps.first { $0.stepType == .work }

        let goal: WorkoutGoal
        if let step = workStep {
            goal = mapGoal(step)
        } else if workout.distanceKm > 0 {
            goal = .distance(workout.distanceKm * 1000, .meters)
        } else if workout.durationMinutes > 0 {
            goal = .time(workout.durationMinutes * 60, .seconds)
        } else {
            goal = .open
        }

        return SingleGoalWorkout(
            activity: .running,
            location: mapLocation(workout.location),
            goal: goal
        )
    }

    static func mapToWorkoutPlan(_ workout: PlannedWorkout) -> WorkoutPlan {
        if isSingleSegment(workout) {
            return WorkoutPlan(.goal(mapToSingleGoalWorkout(workout)))
        } else {
            return WorkoutPlan(.custom(mapToCustomWorkout(workout)))
        }
    }

    static func mapToScheduledPlan(_ workout: PlannedWorkout) -> ScheduledWorkoutPlan? {
        let plan = mapToWorkoutPlan(workout)

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

        // Partition steps into segments: each segment is either a run of consecutive
        // steps sharing the same non-zero groupId, or a maximal run of consecutive
        // steps with groupId == 0 (ungrouped).
        struct Segment {
            let steps: [PlannedWorkoutStep]
            let isGrouped: Bool  // true when groupId != 0
        }

        var segments: [Segment] = []
        var currentSteps: [PlannedWorkoutStep] = []
        var currentGroupId: Int? = nil

        for step in workAndRecoverySteps {
            if step.groupId != 0 {
                // Grouped step — flush any pending ungrouped segment first.
                if currentGroupId == nil && !currentSteps.isEmpty {
                    segments.append(Segment(steps: currentSteps, isGrouped: false))
                    currentSteps = []
                }
                // If continuing the same group, accumulate. Otherwise flush and start new.
                if currentGroupId == step.groupId {
                    currentSteps.append(step)
                } else {
                    if currentGroupId != nil && !currentSteps.isEmpty {
                        segments.append(Segment(steps: currentSteps, isGrouped: true))
                        currentSteps = []
                    }
                    currentGroupId = step.groupId
                    currentSteps.append(step)
                }
            } else {
                // Ungrouped step — flush any pending grouped segment first.
                if currentGroupId != nil && !currentSteps.isEmpty {
                    segments.append(Segment(steps: currentSteps, isGrouped: true))
                    currentSteps = []
                    currentGroupId = nil
                }
                currentSteps.append(step)
            }
        }
        if !currentSteps.isEmpty {
            segments.append(Segment(steps: currentSteps, isGrouped: currentGroupId != nil))
        }

        var blocks: [IntervalBlock] = []

        for segment in segments {
            if segment.isGrouped {
                // Grouped interval block: all steps become interval steps, the first
                // step's repeatCount determines iterations for the whole group.
                let iterations = segment.steps.first?.repeatCount ?? 1
                var intervals: [IntervalStep] = []
                for step in segment.steps {
                    if step.stepType == .work {
                        intervals.append(IntervalStep(.work, goal: mapGoal(step), alert: mapAlert(step)))
                    } else {
                        intervals.append(IntervalStep(.recovery, goal: mapGoal(step)))
                    }
                }
                if !intervals.isEmpty {
                    blocks.append(IntervalBlock(steps: intervals, iterations: iterations))
                }
            } else {
                // Ungrouped: use legacy work+recovery pairing logic.
                var i = 0
                while i < segment.steps.count {
                    let step = segment.steps[i]
                    if step.stepType == .work {
                        let workInterval = IntervalStep(.work, goal: mapGoal(step), alert: mapAlert(step))
                        if i + 1 < segment.steps.count && segment.steps[i + 1].stepType == .recovery {
                            let recoveryStep = segment.steps[i + 1]
                            let recoveryInterval = IntervalStep(.recovery, goal: mapGoal(recoveryStep))
                            blocks.append(IntervalBlock(steps: [workInterval, recoveryInterval], iterations: step.repeatCount))
                            i += 2
                        } else {
                            blocks.append(IntervalBlock(steps: [workInterval], iterations: step.repeatCount))
                            i += 1
                        }
                    } else {
                        i += 1
                    }
                }
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
