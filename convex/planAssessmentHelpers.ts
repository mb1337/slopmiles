import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

export type PlanAssessmentState = {
  status: "none" | "pending" | "ready" | "failed";
  assessment: {
    _id: Id<"planAssessments">;
    planId: Id<"trainingPlans">;
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
  } | null;
  request: {
    _id: Id<"aiRequests">;
    status: Doc<"aiRequests">["status"];
    errorMessage?: string;
    nextRetryAt?: number;
    createdAt: number;
    updatedAt: number;
  } | null;
};

function mapAssessmentRecord(record: Doc<"planAssessments">) {
  return {
    _id: record._id,
    planId: record.planId,
    summary: record.summary,
    volumeAdherence: record.volumeAdherence,
    paceAdherence: record.paceAdherence,
    vdotStart: record.vdotStart,
    vdotEnd: record.vdotEnd,
    highlights: record.highlights,
    areasForImprovement: record.areasForImprovement,
    nextPlanSuggestion: record.nextPlanSuggestion,
    discussionPrompts: record.discussionPrompts,
    createdAt: record.createdAt,
  };
}

function mapRequestRecord(record: Doc<"aiRequests">) {
  return {
    _id: record._id,
    status: record.status,
    errorMessage: record.errorMessage,
    nextRetryAt: record.nextRetryAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export async function loadPlanAssessmentStateMaps(ctx: QueryCtx, userId: Id<"users">) {
  const [assessments, requests] = await Promise.all([
    ctx.db.query("planAssessments").withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId)).collect(),
    ctx.db
      .query("aiRequests")
      .withIndex("by_user_id_call_type_created_at", (queryBuilder) =>
        queryBuilder.eq("userId", userId).eq("callType", "planAssessment"),
      )
      .order("desc")
      .collect(),
  ]);

  const assessmentByPlanId = new Map<string, ReturnType<typeof mapAssessmentRecord>>();
  for (const assessment of [...assessments].sort((left, right) => right.createdAt - left.createdAt)) {
    const key = String(assessment.planId);
    if (!assessmentByPlanId.has(key)) {
      assessmentByPlanId.set(key, mapAssessmentRecord(assessment));
    }
  }
  const requestByPlanId = new Map<string, ReturnType<typeof mapRequestRecord>>();

  for (const request of requests) {
    const input = request.input as { planId?: Id<"trainingPlans"> } | undefined;
    if (!input?.planId) {
      continue;
    }

    const key = String(input.planId);
    if (!requestByPlanId.has(key)) {
      requestByPlanId.set(key, mapRequestRecord(request));
    }
  }

  return {
    assessmentByPlanId,
    requestByPlanId,
  };
}

export function resolvePlanAssessmentState(args: {
  planId: Id<"trainingPlans">;
  assessmentByPlanId: Map<string, ReturnType<typeof mapAssessmentRecord>>;
  requestByPlanId: Map<string, ReturnType<typeof mapRequestRecord>>;
}): PlanAssessmentState {
  const assessment = args.assessmentByPlanId.get(String(args.planId)) ?? null;
  const request = args.requestByPlanId.get(String(args.planId)) ?? null;

  if (assessment) {
    return {
      status: "ready",
      assessment,
      request,
    };
  }

  if (!request) {
    return {
      status: "none",
      assessment: null,
      request: null,
    };
  }

  return {
    status: request.status === "failed" ? "failed" : "pending",
    assessment: null,
    request,
  };
}
