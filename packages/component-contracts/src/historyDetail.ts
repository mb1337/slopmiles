export type HistoryDetailView = {
  workout: {
    _id: string;
    startedAt: number;
    distanceMeters: number;
    durationSeconds: number;
    rawPaceSecondsPerMeter?: number;
    averageHeartRate?: number;
    elevationAscentMeters?: number;
    elevationDescentMeters?: number;
  };
  executionDetail: unknown;
};
