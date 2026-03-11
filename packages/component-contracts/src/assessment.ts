export type PlanAssessmentView = {
  _id: string;
  planId: string;
  summary: string;
  volumeAdherence: number;
  paceAdherence: number;
  vdotStart: number;
  vdotEnd: number;
  highlights: string[];
  areasForImprovement: string[];
  nextPlanSuggestion: string;
  discussionPrompts: string[];
  createdAt: number;
};

export type PlanAssessmentRequestView = {
  _id: string;
  status: string;
  errorMessage?: string;
  nextRetryAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type PlanAssessmentStateView = {
  status: "none" | "pending" | "ready" | "failed";
  assessment: PlanAssessmentView | null;
  request: PlanAssessmentRequestView | null;
};
