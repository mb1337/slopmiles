export function findMissingPendingWorkoutIds(
  pendingWorkoutIds: string[],
  importedWorkoutIds: string[],
): string[] {
  const importedWorkoutIdSet = new Set(importedWorkoutIds);
  return pendingWorkoutIds.filter((workoutId) => !importedWorkoutIdSet.has(workoutId));
}
