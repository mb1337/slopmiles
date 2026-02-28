import type { OnboardingStep } from "@slopmiles/domain";

const PHASES: OnboardingStep[] = [
  "welcome",
  "profileBasics",
  "runningSchedule",
  "trackAccess",
  "competitiveness",
  "personality",
  "done",
];

export function App() {
  return (
    <main className="page">
      <section className="card">
        <h1>SlopMiles Companion</h1>
        <p>
          Web companion scaffold is in place. iOS is the primary implementation target for Phase 1.
        </p>
        <p className="caption">Onboarding milestones mirrored from domain package:</p>
        <ol>
          {PHASES.map((phase) => (
            <li key={phase}>{phase}</li>
          ))}
        </ol>
      </section>
    </main>
  );
}
