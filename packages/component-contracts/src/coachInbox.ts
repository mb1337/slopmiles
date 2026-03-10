export type CoachInboxView = {
  currentVDOT: number | null;
  competitiveness: string;
  personality: {
    name: string;
    description: string;
  };
  runningSchedule: {
    preferredRunningDays: string[];
    runningDaysPerWeek: number;
    preferredLongRunDay: string | null;
  } | null;
  activePlan: {
    _id: string;
    goalLabel: string;
    numberOfWeeks: number;
    volumeMode: string;
    peakWeekVolume: number;
    currentWeekNumber: number | null;
  } | null;
  suggestedPrompts: string[];
  messages: Array<{
    _id: string;
    author: string;
    kind: string;
    body: string;
    createdAt: number;
    cta:
      | {
          label: string;
          tab: "plan" | "history";
        }
      | null;
  }>;
};
