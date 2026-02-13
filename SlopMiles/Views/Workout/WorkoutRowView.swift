import SwiftUI

struct WorkoutRowView: View {
    let workout: PlannedWorkout
    let unitPref: UnitPreference

    var body: some View {
        HStack {
            Image(systemName: workout.workoutType.iconName).foregroundStyle(.blue).frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(workout.name).font(.subheadline)
                HStack(spacing: 8) {
                    Text(DateFormatters.shortDayOfWeek.string(from: workout.scheduledDate))
                    if workout.distanceKm > 0 { Text(UnitConverter.formatDistance(workout.distanceKm, unit: unitPref)) }
                    if let pace = workout.targetPaceMinPerKm { Text(UnitConverter.formatPace(pace, unit: unitPref)) }
                }
                .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            switch workout.completionStatus {
            case .completed: Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
            case .scheduled: Image(systemName: "applewatch").foregroundStyle(.blue)
            case .skipped: Image(systemName: "xmark.circle").foregroundStyle(.orange)
            case .planned: Image(systemName: "circle").foregroundStyle(.quaternary)
            }
        }
    }
}
