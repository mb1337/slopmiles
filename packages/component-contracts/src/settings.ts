import type { Weekday } from "../../domain/src/index";

export type SettingsView = {
  user: {
    _id: string;
    name: string;
    unitPreference: string;
    volumePreference: string;
    trackAccess: boolean;
    healthKitAuthorized: boolean;
    strengthTrainingEnabled?: boolean;
    strengthEquipment?: string[];
  } | null;
  runningSchedule: {
    preferredRunningDays: Weekday[];
    runningDaysPerWeek: number;
    preferredLongRunDay: Weekday | null;
    preferredQualityDays: Weekday[];
    availabilityWindows?: Partial<Record<Weekday, Array<{ start: string; end: string }>>>;
  } | null;
  competitiveness: {
    level: string;
  } | null;
  personality: {
    name: string;
    description: string;
  } | null;
  strengthPreference: {
    enabled: boolean;
    equipment: string[];
  };
  hasActivePlan: boolean;
  courses: Array<{
    _id: string;
    name: string;
    distanceMeters: number;
    distanceUnit: string;
    surface: string;
    notes?: string;
  }>;
  races: Array<{
    _id: string;
    label: string;
    plannedDate: number;
    distanceMeters: number;
    goalTimeSeconds?: number;
    actualTimeSeconds?: number;
    isPrimaryGoal: boolean;
    planId?: string;
  }>;
  healthKit: {
    authorized: boolean;
    lastSyncAt: number | null;
    lastSyncSource: string | null;
    lastSyncError: string | null;
  };
};
