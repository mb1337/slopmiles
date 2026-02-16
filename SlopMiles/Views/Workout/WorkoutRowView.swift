import SwiftUI

struct WorkoutRowView: View {
    let workout: PlannedWorkout
    let unitPref: UnitPreference

    private var volumeType: VolumeType { workout.week?.plan?.volumeType ?? .distance }

    var body: some View {
        HStack {
            Image(systemName: workout.workoutType.iconName).foregroundStyle(.blue).frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(workout.name).font(.subheadline)
                HStack(spacing: 8) {
                    Text(DateFormatters.shortDayOfWeek(from: workout.scheduledDate))
                    if volumeType == .time {
                        if workout.durationMinutes > 0 { Text(UnitConverter.formatDuration(minutes: workout.durationMinutes)) }
                    } else {
                        if workout.distanceKm > 0 { Text(UnitConverter.formatDistance(workout.distanceKm, unit: unitPref)) }
                    }
                    Text(workout.intensityTarget.displayName)
                    if let pace = workout.targetPaceMinPerKm { Text(UnitConverter.formatPace(pace, unit: unitPref)) }
                }
                .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            switch workout.completionStatus {
            case .completed: Image(systemName: "checkmark.circle.fill").foregroundStyle(.green).accessibilityLabel("Completed")
            case .scheduled: Image(systemName: "applewatch").foregroundStyle(.blue).accessibilityLabel("Scheduled on Watch")
            case .skipped: Image(systemName: "xmark.circle").foregroundStyle(.orange).accessibilityLabel("Skipped")
            case .planned: Image(systemName: "circle").foregroundStyle(.quaternary).accessibilityLabel("Planned")
            }
        }
    }
}
