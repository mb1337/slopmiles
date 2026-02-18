import SwiftData
import SwiftUI

@MainActor
enum PreviewData {

    // MARK: - Container

    static var container: ModelContainer = {
        let schema = Schema([
            TrainingPlan.self,
            TrainingWeek.self,
            PlannedWorkout.self,
            PlannedWorkoutStep.self,
            UserProfile.self,
            WeeklySchedule.self,
            RunnerEquipment.self,
            AISettings.self,
            CoachingConversation.self,
        ])
        let config = ModelConfiguration(
            schema: schema,
            isStoredInMemoryOnly: true,
            cloudKitDatabase: .none
        )
        let container = try! ModelContainer(for: schema, configurations: [config])
        seedSampleData(into: container.mainContext)
        return container
    }()

    /// Insert sample singleton models and training plan into the given context.
    /// Used by both SwiftUI previews and UI test launch arguments.
    static func seedSampleData(into context: ModelContext) {
        context.insert(sampleProfile)
        context.insert(sampleSettings)
        context.insert(sampleSchedule)
        context.insert(sampleEquipment)
        context.insert(samplePlan)
    }

    // MARK: - AppState

    static let appState: AppState = AppState()

    // MARK: - Singleton Models

    static let sampleProfile: UserProfile = {
        let p = UserProfile()
        p.experienceLevel = .intermediate
        p.peakWeeklyMileageKm = 48.3 // ~30 mi
        p.unitPreference = .imperial
        p.volumeType = .distance
        p.vdot = 45
        p.maxHeartRate = 185
        p.restingHeartRate = 52
        p.homeLatitude = 40.7128
        p.homeLongitude = -74.0060
        return p
    }()

    static let sampleSettings: AISettings = {
        let s = AISettings()
        s.hasCompletedOnboarding = true
        return s
    }()

    static let sampleSchedule: WeeklySchedule = WeeklySchedule()

    static let sampleEquipment: RunnerEquipment = {
        let e = RunnerEquipment()
        e.hasTrackAccess = true
        e.hasTrailAccess = true
        e.indoorOutdoorPreference = .preferOutdoor
        return e
    }()

    // MARK: - Training Plan

    static let samplePlan: TrainingPlan = {
        let now = Date()
        let cal = Calendar.current
        let startDate = cal.date(byAdding: .weekOfYear, value: -1, to: now)!
        let endDate = cal.date(byAdding: .weekOfYear, value: 11, to: startDate)!

        let plan = TrainingPlan(
            name: "Half Marathon Training",
            goalDescription: "Run a half marathon in under 1:50",
            raceDistance: 21097.5,
            raceDate: endDate,
            difficulty: .intermediate,
            startDate: startDate,
            endDate: endDate,
            weeklyMileageTargetKm: 48.3,
            isActive: true
        )

        // Week 1 — generated with workouts
        let week1 = TrainingWeek(
            weekNumber: 1,
            theme: "Base Building",
            totalDistanceKm: 40.0,
            workoutsGenerated: true
        )
        week1.plan = plan

        let monday = cal.date(byAdding: .day, value: 0, to: startDate)!
        let tuesday = cal.date(byAdding: .day, value: 1, to: startDate)!
        let wednesday = cal.date(byAdding: .day, value: 2, to: startDate)!
        let thursday = cal.date(byAdding: .day, value: 3, to: startDate)!
        let friday = cal.date(byAdding: .day, value: 4, to: startDate)!
        let saturday = cal.date(byAdding: .day, value: 5, to: startDate)!

        let easy = PlannedWorkout(
            name: "Easy Run",
            workoutType: .easy,
            scheduledDate: monday,
            distanceKm: 8.0,
            durationMinutes: 48,
            targetPaceMinPerKm: 6.0
        )
        easy.completionStatus = .completed
        easy.week = week1

        let tempo = PlannedWorkout(
            name: "Tempo Run",
            workoutType: .tempo,
            scheduledDate: tuesday,
            distanceKm: 9.6,
            durationMinutes: 50,
            targetPaceMinPerKm: 5.1
        )
        tempo.completionStatus = .scheduled
        tempo.week = week1

        let intervals = PlannedWorkout(
            name: "5×1000m Intervals",
            workoutType: .interval,
            scheduledDate: wednesday,
            distanceKm: 10.0,
            durationMinutes: 55,
            targetPaceMinPerKm: 4.8
        )
        intervals.week = week1

        // Steps for interval workout
        let warmup = PlannedWorkoutStep(
            order: 0,
            stepType: .warmup,
            name: "Warmup",
            goalType: .distance,
            goalValue: 1600,
            targetPaceMinPerKm: 6.0
        )
        warmup.workout = intervals

        let work1 = PlannedWorkoutStep(
            order: 1,
            stepType: .work,
            name: "1000m Hard",
            goalType: .distance,
            goalValue: 1000,
            targetPaceMinPerKm: 4.3
        )
        work1.groupId = 1
        work1.workout = intervals

        let rest1 = PlannedWorkoutStep(
            order: 2,
            stepType: .recovery,
            name: "Recovery Jog",
            goalType: .time,
            goalValue: 90,
            targetPaceMinPerKm: 6.5
        )
        rest1.groupId = 1
        rest1.repeatCount = 5
        rest1.workout = intervals

        let work2 = PlannedWorkoutStep(
            order: 3,
            stepType: .work,
            name: "Tempo Finish",
            goalType: .distance,
            goalValue: 1600,
            targetPaceMinPerKm: 4.8
        )
        work2.workout = intervals

        let cooldown = PlannedWorkoutStep(
            order: 4,
            stepType: .cooldown,
            name: "Cooldown",
            goalType: .distance,
            goalValue: 1600,
            targetPaceMinPerKm: 6.5
        )
        cooldown.workout = intervals

        let longRun = PlannedWorkout(
            name: "Long Run",
            workoutType: .long,
            scheduledDate: thursday,
            distanceKm: 16.0,
            durationMinutes: 96,
            targetPaceMinPerKm: 6.0
        )
        longRun.week = week1

        let recovery = PlannedWorkout(
            name: "Recovery Run",
            workoutType: .recovery,
            scheduledDate: friday,
            distanceKm: 5.0,
            durationMinutes: 35,
            targetPaceMinPerKm: 7.0
        )
        recovery.week = week1

        let rest = PlannedWorkout(
            name: "Rest Day",
            workoutType: .rest,
            scheduledDate: saturday
        )
        rest.week = week1

        // Week 2 — not yet generated
        let week2 = TrainingWeek(
            weekNumber: 2,
            theme: "Building Volume",
            totalDistanceKm: 45.0,
            workoutsGenerated: false
        )
        week2.plan = plan

        plan.weeks = [week1, week2]

        return plan
    }()

    // MARK: - Convenience Accessors

    static var sampleWeek: TrainingWeek {
        samplePlan.sortedWeeks.first!
    }

    static var sampleWorkout: PlannedWorkout {
        // Return the interval workout
        sampleWeek.sortedWorkouts.first { $0.workoutType == .interval }
            ?? sampleWeek.sortedWorkouts.first!
    }
}
