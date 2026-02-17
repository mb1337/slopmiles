import SwiftUI

struct WorkoutRowView: View {
    let workout: PlannedWorkout
    let unitPref: UnitPreference

    private var volumeType: VolumeType { workout.week?.plan?.volumeType ?? .distance }

    private var dayLabel: String {
        let day = DateFormatters.shortDayOfWeek(from: workout.scheduledDate)
        let calendar = Calendar.current
        let hasDouble = workout.week?.sortedWorkouts.contains { other in
            other.id != workout.id && calendar.isDate(other.scheduledDate, inSameDayAs: workout.scheduledDate)
        } ?? false
        if hasDouble {
            return "\(day) \(DateFormatters.timeOnly(from: workout.scheduledDate))"
        }
        return day
    }

    var body: some View {
        HStack {
            Image(systemName: workout.workoutType.iconName).foregroundStyle(.blue).frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(workout.name).font(.subheadline)
                HStack(spacing: 8) {
                    Text(dayLabel)
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
            CompletionStatusIcon(status: workout.completionStatus)
        }
    }
}

struct CompletionStatusIcon: View {
    let status: WorkoutCompletionStatus

    var body: some View {
        Group {
            switch status {
            case .completed: Image(systemName: "checkmark.circle.fill").foregroundStyle(.green).accessibilityLabel("Completed")
            case .scheduled: Image(systemName: "applewatch").foregroundStyle(.blue).accessibilityLabel("Scheduled on Watch")
            case .skipped: Image(systemName: "xmark.circle.fill").foregroundStyle(.orange).accessibilityLabel("Skipped")
            case .planned: Image(systemName: "circle").foregroundStyle(.secondary).accessibilityLabel("Planned")
            }
        }
        .contentTransition(.symbolEffect(.replace))
    }
}

#Preview {
    WorkoutRowView(workout: PreviewData.sampleWorkout, unitPref: .imperial)
        .modelContainer(PreviewData.container)
}
