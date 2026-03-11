import type { PlanAssessmentStateView } from "@slopmiles/component-contracts";

import { Button } from "./shared";

export function PlanAssessmentSummary({
  state,
  onRetry,
  retrying,
}: {
  state: PlanAssessmentStateView;
  onRetry?: (requestId: string) => void;
  retrying?: boolean;
}) {
  if (state.status === "none") {
    return <p>No assessment yet.</p>;
  }

  if (state.status === "pending") {
    return (
      <div className="stack">
        <p>Assessment pending. The coach is still pulling the block together.</p>
        {state.request?.errorMessage ? <p>{state.request.errorMessage}</p> : null}
        {state.request?._id && onRetry ? (
          <Button
            kind="secondary"
            disabled={retrying}
            onClick={() => onRetry(state.request!._id)}
          >
            {retrying ? "Retrying…" : "Retry now"}
          </Button>
        ) : null}
      </div>
    );
  }

  if (state.status === "failed") {
    return (
      <div className="stack">
        <p>{state.request?.errorMessage ?? "Assessment failed."}</p>
        {state.request?._id && onRetry ? (
          <Button
            kind="secondary"
            disabled={retrying}
            onClick={() => onRetry(state.request!._id)}
          >
            {retrying ? "Retrying…" : "Retry assessment"}
          </Button>
        ) : null}
      </div>
    );
  }

  const assessment = state.assessment;
  if (!assessment) {
    return <p>Assessment unavailable.</p>;
  }

  return (
    <div className="stack">
      <p>{assessment.summary}</p>
      <div className="mini-metrics">
        <div className="mini-stat">
          <strong>{Math.round(assessment.volumeAdherence * 100)}%</strong>
          <span>volume</span>
        </div>
        <div className="mini-stat">
          <strong>{Math.round(assessment.paceAdherence * 100)}%</strong>
          <span>pace</span>
        </div>
        <div className="mini-stat">
          <strong>
            {assessment.vdotStart.toFixed(1)} → {assessment.vdotEnd.toFixed(1)}
          </strong>
          <span>VDOT</span>
        </div>
      </div>
      <div className="inset">
        <strong>Highlights</strong>
        <div className="metric-list wrap">
          {assessment.highlights.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </div>
      <div className="inset">
        <strong>Improve next</strong>
        <div className="metric-list wrap">
          {assessment.areasForImprovement.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </div>
      <div className="inset">
        <strong>Next block</strong>
        <p>{assessment.nextPlanSuggestion}</p>
      </div>
      <div className="inset">
        <strong>Discuss with coach</strong>
        <div className="metric-list wrap">
          {assessment.discussionPrompts.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
