import { useEffect, useMemo, useState } from "react";
import { Authenticated, AuthLoading, ConvexReactClient, Unauthenticated, useMutation, useQuery } from "convex/react";
import { ConvexAuthProvider, useAuthActions } from "@convex-dev/auth/react";
import { projectedRaceTime, type CompetitivenessLevel, type PersonalityPreset, type UnitPreference, type VolumeMode, type Weekday } from "@slopmiles/domain";
import {
  BrowserRouter,
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";

import { api, type Id } from "./convex";
import { formatDateKey, formatDateTime, formatDistance, formatDuration, formatPace, formatRaceTime, formatVolume } from "./format";

type SessionPayload = Awaited<ReturnType<ReturnType<typeof useMutation<typeof api.users.bootstrapSession>>>>;

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function formatWorkoutType(type: string) {
  switch (type) {
    case "easyRun":
      return "Easy Run";
    case "longRun":
      return "Long Run";
    case "tempo":
      return "Tempo";
    case "intervals":
      return "Intervals";
    case "recovery":
      return "Recovery";
    default:
      return type;
  }
}

function Button({
  children,
  onClick,
  kind = "primary",
  disabled,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  kind?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button className={cx("button", `button-${kind}`)} onClick={onClick} disabled={disabled} type={type}>
      {children}
    </button>
  );
}

function Card({
  title,
  eyebrow,
  children,
  actions,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
          <h2>{title}</h2>
        </div>
        {actions ? <div className="panel-actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function StatusMessage({ message, tone = "neutral" }: { message: string; tone?: "neutral" | "error" | "success" }) {
  return <div className={cx("status", `status-${tone}`)}>{message}</div>;
}

function Screen({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="screen">
      <header className="screen-head">
        <div className="eyebrow">SlopMiles Companion</div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </header>
      {children}
    </div>
  );
}

function MissingConfigScreen() {
  return (
    <main className="auth-screen">
      <Card title="Missing web configuration" eyebrow="Configuration">
        <p>Set <code>VITE_CONVEX_URL</code> for the web client before starting the app.</p>
      </Card>
    </main>
  );
}

function SignInScreen() {
  const { signIn } = useAuthActions();
  const [appleBusy, setAppleBusy] = useState(false);
  const [otpBusy, setOtpBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [otpStep, setOtpStep] = useState<"request" | "verify">("request");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const emailRedirectTo = `${window.location.origin}/dashboard`;

  const handleSignIn = async () => {
    setAppleBusy(true);
    setError(null);
    setInfo(null);
    try {
      await signIn("apple", {
        redirectTo: `${window.location.pathname}${window.location.search}${window.location.hash}`,
      });
    } catch (signInError) {
      setError(String(signInError));
      setAppleBusy(false);
      return;
    } finally {
      setAppleBusy(false);
    }
  };

  const handleSendCode = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    setOtpBusy(true);
    setError(null);
    setInfo(null);
    try {
      await signIn("email", {
        email: normalizedEmail,
        redirectTo: emailRedirectTo,
      });
      setOtpStep("verify");
      setInfo(`Sent a code to ${normalizedEmail}.`);
    } catch (sendError) {
      setError(String(sendError));
    } finally {
      setOtpBusy(false);
    }
  };

  const handleVerifyCode = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    setOtpBusy(true);
    setError(null);
    setInfo(null);
    try {
      await signIn("email", {
        email: normalizedEmail,
        code: code.trim(),
        redirectTo: emailRedirectTo,
      });
    } catch (verifyError) {
      setError(String(verifyError));
    } finally {
      setOtpBusy(false);
    }
  };

  return (
    <main className="auth-screen">
      <div className="hero">
        <div className="hero-copy">
          <div className="eyebrow">Desktop-first training companion</div>
          <h1>Plans, history, coach feedback, and settings in one browser workflow.</h1>
          <p>
            Sign in with Apple to open the same SlopMiles account you use on iPhone. Workout import stays managed on
            iPhone; everything synced to Convex is available here.
          </p>
          <div className="button-row">
            <Button onClick={() => void handleSignIn()} disabled={appleBusy || otpBusy}>
              {appleBusy ? "Redirecting…" : "Sign in with Apple"}
            </Button>
          </div>
          <div className="auth-divider">
            <span>or use an email code</span>
          </div>
          <Field label="Email">
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </Field>
          {otpStep === "verify" ? (
            <Field label="Verification code">
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="123456"
              />
            </Field>
          ) : null}
          {info ? <StatusMessage message={info} tone="success" /> : null}
          {error ? <StatusMessage message={error} tone="error" /> : null}
          {otpStep === "request" ? (
            <Button onClick={() => void handleSendCode()} disabled={otpBusy || appleBusy || email.trim().length === 0}>
              {otpBusy ? "Sending…" : "Send code"}
            </Button>
          ) : (
            <div className="button-row">
              <Button
                onClick={() => void handleVerifyCode()}
                disabled={otpBusy || appleBusy || email.trim().length === 0 || code.trim().length === 0}
              >
                {otpBusy ? "Verifying…" : "Verify code"}
              </Button>
              <Button
                kind="secondary"
                onClick={() => {
                  setOtpStep("request");
                  setCode("");
                  setInfo(null);
                  setError(null);
                }}
                disabled={otpBusy || appleBusy}
              >
                Back
              </Button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function AppLoading() {
  return (
    <main className="auth-screen">
      <Card title="Restoring session" eyebrow="Authentication">
        <p>Connecting to Convex and restoring your secure session.</p>
      </Card>
    </main>
  );
}

function AppShell({
  session,
  onRefresh,
}: {
  session: NonNullable<Awaited<ReturnType<typeof useBootstrapSession>>["session"]>;
  onRefresh: () => Promise<void>;
}) {
  const { signOut } = useAuthActions();
  const location = useLocation();

  const nav = [
    ["/dashboard", "Dashboard"],
    ["/plan", "Plan"],
    ["/history", "History"],
    ["/coach", "Coach"],
    ["/settings", "Settings"],
  ] as const;

  return (
    <div className="shell">
      <aside className="side-nav">
        <div className="brand">
          <div className="eyebrow">SlopMiles</div>
          <strong>{session.user.name}</strong>
          <span>{session.personality.name} coach · {session.competitiveness.level}</span>
        </div>
        <nav>
          {nav.map(([href, label]) => (
            <Link key={href} className={cx("nav-link", location.pathname.startsWith(href) && "nav-link-active")} to={href}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="side-nav-footer">
          <Button kind="secondary" onClick={() => void onRefresh()}>
            Refresh session
          </Button>
          <Button kind="secondary" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </aside>

      <div className="content-shell">
        <div className="topbar">
          <div>
            <strong>{session.user.name}</strong>
            <span>{session.user.currentVDOT ? `VDOT ${session.user.currentVDOT.toFixed(1)}` : "No VDOT yet"}</span>
          </div>
          <div className="pill-row">
            <span className="pill">{session.user.volumePreference}</span>
            <span className="pill">{session.user.unitPreference}</span>
            <span className="pill">{session.user.trackAccess ? "track" : "road/time"}</span>
          </div>
        </div>
        <Outlet />
        <nav className="mobile-nav">
          {nav.map(([href, label]) => (
            <Link key={href} className={cx("mobile-link", location.pathname.startsWith(href) && "mobile-link-active")} to={href}>
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

function useBootstrapSession() {
  const bootstrap = useMutation(api.users.bootstrapSession);
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setError(null);
    setLoading(true);
    try {
      const payload = await bootstrap({});
      setSession(payload);
    } catch (refreshError) {
      setError(String(refreshError));
      setSession(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return { session, loading, error, refresh };
}

function AuthenticatedApp() {
  const { session, loading, error, refresh } = useBootstrapSession();

  if (loading) {
    return <AppLoading />;
  }

  if (!session) {
    return (
      <main className="auth-screen">
        <Card title="Session unavailable" eyebrow="Error">
          <p>{error ?? "Could not load your SlopMiles session."}</p>
          <Button onClick={() => void refresh()}>Retry</Button>
        </Card>
      </main>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={<Navigate replace to={session.onboardingState.isComplete ? "/dashboard" : "/onboarding"} />}
        />
        <Route
          path="/onboarding"
          element={<OnboardingPage session={session} onRefresh={refresh} />}
        />
        <Route
          element={
            session.onboardingState.isComplete ? (
              <AppShell session={session} onRefresh={refresh} />
            ) : (
              <Navigate replace to="/onboarding" />
            )
          }
        >
          <Route path="/dashboard" element={<DashboardPage session={session} />} />
          <Route path="/plan" element={<PlanPage session={session} onRefresh={refresh} />} />
          <Route path="/plan/week/:weekNumber" element={<WeekPage session={session} />} />
          <Route path="/plan/workout/:workoutId" element={<WorkoutPage session={session} />} />
          <Route path="/history" element={<HistoryPage session={session} />} />
          <Route path="/history/:healthKitWorkoutId" element={<HistoryWorkoutPage session={session} />} />
          <Route path="/coach" element={<CoachPage />} />
          <Route path="/settings" element={<SettingsPage session={session} onRefresh={refresh} />} />
        </Route>
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}

function OnboardingPage({
  session,
  onRefresh,
}: {
  session: NonNullable<Awaited<ReturnType<typeof useBootstrapSession>>["session"]>;
  onRefresh: () => Promise<void>;
}) {
  const completeStep = useMutation(api.onboarding.completeStep);
  const saveHealthKitAuthorization = useMutation(api.onboarding.saveHealthKitAuthorization);
  const saveProfileBasics = useMutation(api.onboarding.saveProfileBasics);
  const saveRunningSchedule = useMutation(api.onboarding.saveRunningSchedule);
  const saveTrackAccess = useMutation(api.onboarding.saveTrackAccess);
  const saveVdotFromHistoryWorkout = useMutation(api.onboarding.saveVdotFromHistoryWorkout);
  const saveVdotFromManualResult = useMutation(api.onboarding.saveVdotFromManualResult);
  const saveCompetitiveness = useMutation(api.onboarding.saveCompetitiveness);
  const savePersonality = useMutation(api.onboarding.savePersonality);
  const historyWorkouts = useQuery(
    api.healthkit.listImportedWorkouts,
    session.onboardingState.currentStep === "establishVDOT" ? { limit: 200 } : "skip",
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unitPreference, setUnitPreference] = useState<UnitPreference>(session.user.unitPreference);
  const [volumeMode, setVolumeMode] = useState<VolumeMode>(session.user.volumePreference);
  const [runningDays, setRunningDays] = useState<Weekday[]>(session.runningSchedule.preferredRunningDays);
  const [runningDaysPerWeek, setRunningDaysPerWeek] = useState(session.runningSchedule.runningDaysPerWeek);
  const [longRunDay, setLongRunDay] = useState<Weekday | "">((session.runningSchedule.preferredLongRunDay ?? "") as Weekday | "");
  const [qualityDays, setQualityDays] = useState<Weekday[]>(session.runningSchedule.preferredQualityDays);
  const [trackAccess, setTrackAccess] = useState(session.user.trackAccess);
  const [manualDistance, setManualDistance] = useState("5000");
  const [manualTime, setManualTime] = useState("1500");
  const [competitiveness, setCompetitiveness] = useState<CompetitivenessLevel>(session.competitiveness.level);
  const [personality, setPersonality] = useState<PersonalityPreset>(session.personality.name as PersonalityPreset);
  const [customPersonality, setCustomPersonality] = useState(session.personality.name === "custom" ? session.personality.description : "");
  const navigate = useNavigate();

  const run = async (task: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await task();
      await onRefresh();
    } catch (taskError) {
      setError(String(taskError));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (session.onboardingState.isComplete) {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate, session.onboardingState.isComplete]);

  const toggleDay = (day: Weekday, days: Weekday[], setDays: (value: Weekday[]) => void) => {
    setDays(days.includes(day) ? days.filter((entry) => entry !== day) : [...days, day]);
  };

  return (
    <main className="onboarding-shell">
      <Screen title="Onboarding" subtitle={`Current step: ${session.onboardingState.currentStep}`}>
        {error ? <StatusMessage message={error} tone="error" /> : null}

        {session.onboardingState.currentStep === "welcome" ? (
          <Card title="Welcome" eyebrow="Step 1">
            <p>Your browser companion mirrors the core plan, history, coach, and settings experience from iPhone.</p>
            <Button onClick={() => void run(async () => completeStep({ step: "welcome" }))} disabled={busy}>
              Start setup
            </Button>
          </Card>
        ) : null}

        {session.onboardingState.currentStep === "healthKitAuthorization" ? (
          <Card title="Workout import lives on iPhone" eyebrow="Step 2">
            <p>
              The web app never requests HealthKit access. SlopMiles uses workouts already synced from the iPhone app.
              You can continue here and authorize or re-sync HealthKit later from iPhone if needed.
            </p>
            <Button
              onClick={() =>
                void run(async () =>
                  saveHealthKitAuthorization({
                    authorized: false,
                  }),
                )
              }
              disabled={busy}
            >
              Continue
            </Button>
          </Card>
        ) : null}

        {session.onboardingState.currentStep === "profileBasics" ? (
          <Card title="Profile basics" eyebrow="Step 3">
            <div className="form-grid">
              <Field label="Units">
                <select value={unitPreference} onChange={(event) => setUnitPreference(event.target.value as UnitPreference)}>
                  <option value="system">System</option>
                  <option value="metric">Metric</option>
                  <option value="imperial">Imperial</option>
                </select>
              </Field>
              <Field label="Volume mode">
                <select value={volumeMode} onChange={(event) => setVolumeMode(event.target.value as VolumeMode)}>
                  <option value="time">Time</option>
                  <option value="distance">Distance</option>
                </select>
              </Field>
            </div>
            <Button
              onClick={() => void run(async () => saveProfileBasics({ unitPreference, volumePreference: volumeMode }))}
              disabled={busy}
            >
              Save profile basics
            </Button>
          </Card>
        ) : null}

        {session.onboardingState.currentStep === "runningSchedule" ? (
          <Card title="Running schedule" eyebrow="Step 4">
            <div className="pill-row wrap">
              {(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as Weekday[]).map((day) => (
                <button
                  key={day}
                  className={cx("pill-button", runningDays.includes(day) && "pill-button-active")}
                  onClick={() => toggleDay(day, runningDays, setRunningDays)}
                  type="button"
                >
                  {day.slice(0, 3)}
                </button>
              ))}
            </div>
            <div className="form-grid">
              <Field label="Run days per week">
                <input
                  min={1}
                  max={7}
                  type="number"
                  value={runningDaysPerWeek}
                  onChange={(event) => setRunningDaysPerWeek(Number(event.target.value))}
                />
              </Field>
              <Field label="Preferred long run day">
                <select value={longRunDay} onChange={(event) => setLongRunDay(event.target.value as Weekday | "")}>
                  <option value="">Coach decides</option>
                  {runningDays.map((day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Preferred quality days">
              <div className="pill-row wrap">
                {runningDays.map((day) => (
                  <button
                    key={day}
                    className={cx("pill-button", qualityDays.includes(day) && "pill-button-active")}
                    onClick={() => toggleDay(day, qualityDays, setQualityDays)}
                    type="button"
                  >
                    {day}
                  </button>
                ))}
              </div>
            </Field>
            <Button
              onClick={() =>
                void run(async () =>
                  saveRunningSchedule({
                    preferredRunningDays: runningDays,
                    runningDaysPerWeek,
                    preferredLongRunDay: longRunDay || undefined,
                    preferredQualityDays: qualityDays,
                  }),
                )
              }
              disabled={busy}
            >
              Save schedule
            </Button>
          </Card>
        ) : null}

        {session.onboardingState.currentStep === "trackAccess" ? (
          <Card title="Track access" eyebrow="Step 5">
            <label className="toggle">
              <input checked={trackAccess} onChange={(event) => setTrackAccess(event.target.checked)} type="checkbox" />
              <span>I regularly have access to a running track.</span>
            </label>
            <Button onClick={() => void run(async () => saveTrackAccess({ trackAccess }))} disabled={busy}>
              Save track access
            </Button>
          </Card>
        ) : null}

        {session.onboardingState.currentStep === "establishVDOT" ? (
          <Card title="Establish VDOT" eyebrow="Step 6">
            <p>Use a synced workout or enter a recent race result manually.</p>
            <div className="stack">
              {historyWorkouts?.slice(0, 5).map((workout) => (
                <div className="row-card" key={String(workout._id)}>
                  <div>
                    <strong>{formatDateTime(workout.startedAt)}</strong>
                    <div>{formatDistance(workout.distanceMeters, session.user.unitPreference)} · {formatDuration(workout.durationSeconds)}</div>
                  </div>
                  <Button onClick={() => void run(async () => saveVdotFromHistoryWorkout({ healthKitWorkoutId: workout._id }))} disabled={busy}>
                    Use workout
                  </Button>
                </div>
              ))}
            </div>
            <div className="form-grid">
              <Field label="Manual distance (meters)">
                <input value={manualDistance} onChange={(event) => setManualDistance(event.target.value)} />
              </Field>
              <Field label="Manual time (seconds)">
                <input value={manualTime} onChange={(event) => setManualTime(event.target.value)} />
              </Field>
            </div>
            <div className="button-row">
              <Button
                onClick={() =>
                  void run(async () =>
                    saveVdotFromManualResult({
                      distanceMeters: Number(manualDistance),
                      timeSeconds: Number(manualTime),
                    }),
                  )
                }
                disabled={busy}
              >
                Save manual result
              </Button>
              <Button kind="secondary" onClick={() => void run(async () => completeStep({ step: "establishVDOT" }))} disabled={busy}>
                Skip for now
              </Button>
            </div>
          </Card>
        ) : null}

        {session.onboardingState.currentStep === "competitiveness" ? (
          <Card title="Competitiveness" eyebrow="Step 7">
            <div className="pill-row wrap">
              {(["conservative", "balanced", "aggressive"] as CompetitivenessLevel[]).map((level) => (
                <button
                  key={level}
                  className={cx("pill-button", competitiveness === level && "pill-button-active")}
                  onClick={() => setCompetitiveness(level)}
                  type="button"
                >
                  {level}
                </button>
              ))}
            </div>
            <Button onClick={() => void run(async () => saveCompetitiveness({ level: competitiveness }))} disabled={busy}>
              Save competitiveness
            </Button>
          </Card>
        ) : null}

        {session.onboardingState.currentStep === "personality" ? (
          <Card title="Coach personality" eyebrow="Step 8">
            <div className="pill-row wrap">
              {(["cheerleader", "noNonsense", "nerd", "zen", "custom"] as PersonalityPreset[]).map((preset) => (
                <button
                  key={preset}
                  className={cx("pill-button", personality === preset && "pill-button-active")}
                  onClick={() => setPersonality(preset)}
                  type="button"
                >
                  {preset}
                </button>
              ))}
            </div>
            {personality === "custom" ? (
              <Field label="Custom coach description">
                <textarea value={customPersonality} onChange={(event) => setCustomPersonality(event.target.value)} rows={4} />
              </Field>
            ) : null}
            <Button
              onClick={() =>
                void run(async () =>
                  savePersonality({
                    preset: personality,
                    customDescription: personality === "custom" ? customPersonality : undefined,
                  }),
                )
              }
              disabled={busy}
            >
              Save personality
            </Button>
          </Card>
        ) : null}

        {session.onboardingState.currentStep === "notifications" ? (
          <Card title="Notifications" eyebrow="Step 9">
            <p>Push notifications remain an iPhone concern. The web companion uses inline status and realtime updates.</p>
            <Button onClick={() => void run(async () => completeStep({ step: "notifications" }))} disabled={busy}>
              Finish setup
            </Button>
          </Card>
        ) : null}

        {session.onboardingState.currentStep === "done" ? (
          <Card title="Ready to train" eyebrow="Final step">
            <p>Your onboarding state is complete. Open the dashboard and start using the companion.</p>
            <Button onClick={() => void run(async () => completeStep({ step: "done" }))} disabled={busy}>
              Go to dashboard
            </Button>
          </Card>
        ) : null}
      </Screen>
    </main>
  );
}

function DashboardPage({
  session,
}: {
  session: NonNullable<Awaited<ReturnType<typeof useBootstrapSession>>["session"]>;
}) {
  const dashboard = useQuery(api.companion.getDashboardView, {});

  return (
    <Screen title="Dashboard" subtitle="Current week, next workout, and the latest coaching context.">
      {!dashboard ? <StatusMessage message="Loading dashboard…" /> : null}

      {dashboard ? (
        <>
          <div className="dashboard-grid">
            <Card title={dashboard.activePlan ? dashboard.activePlan.goalLabel : "No active plan"} eyebrow="Plan focus">
              {dashboard.activePlan ? (
                <>
                  <p>
                    Week {dashboard.activePlan.currentWeekNumber ?? "—"} of {dashboard.activePlan.numberOfWeeks} · Peak{" "}
                    {formatVolume(dashboard.activePlan.volumeMode, dashboard.activePlan.peakWeekVolume, session.user.unitPreference)}
                  </p>
                  <Link className="text-link" to="/plan">Open plan</Link>
                </>
              ) : (
                <p>Create a draft in Plan to start building your next block.</p>
              )}
            </Card>

            <Card title={dashboard.nextWorkout ? dashboard.nextWorkout.title : "No scheduled workout"} eyebrow="Next up">
              {dashboard.nextWorkout ? (
                <>
                  <p>{formatDateKey(dashboard.nextWorkout.scheduledDateKey)} · {dashboard.nextWorkout.absoluteVolumeLabel}</p>
                  {dashboard.nextWorkout.notes ? <p>{dashboard.nextWorkout.notes}</p> : null}
                  <Link className="text-link" to={`/plan/workout/${String(dashboard.nextWorkout._id)}`}>Open workout detail</Link>
                </>
              ) : (
                <p>No next workout yet. Generate the current week or activate a draft plan.</p>
              )}
            </Card>
          </div>

          <div className="dashboard-grid">
            <Card title="Week progress" eyebrow="Execution">
              {dashboard.weekProgress ? (
                <p>
                  {dashboard.weekProgress.completedWorkouts}/{dashboard.weekProgress.totalWorkouts} workouts complete ·{" "}
                  {Math.round(dashboard.weekProgress.targetVolumePercent * 100)}% of peak · {dashboard.weekProgress.emphasis}
                </p>
              ) : (
                <p>No active week yet.</p>
              )}
            </Card>

            <Card title="VDOT snapshot" eyebrow="Fitness">
              {typeof dashboard.athlete.currentVDOT === "number" ? (
                <>
                  <p>Current VDOT {dashboard.athlete.currentVDOT.toFixed(1)}</p>
                  <div className="metric-list">
                    <span>5K {formatRaceTime(projectedRaceTime(dashboard.athlete.currentVDOT, 5000))}</span>
                    <span>10K {formatRaceTime(projectedRaceTime(dashboard.athlete.currentVDOT, 10000))}</span>
                    <span>Half {formatRaceTime(projectedRaceTime(dashboard.athlete.currentVDOT, 21097.5))}</span>
                    <span>Marathon {formatRaceTime(projectedRaceTime(dashboard.athlete.currentVDOT, 42195))}</span>
                  </div>
                </>
              ) : (
                <p>No VDOT set yet. Finish onboarding or use synced history to establish one.</p>
              )}
            </Card>
          </div>

          <Card title="Latest coach note" eyebrow="Coach">
            {dashboard.latestCoachMessage ? (
              <p>{dashboard.latestCoachMessage.body}</p>
            ) : (
              <p>No coach notes yet. Open Coach to start the thread.</p>
            )}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function PlanPage({
  session,
  onRefresh,
}: {
  session: NonNullable<Awaited<ReturnType<typeof useBootstrapSession>>["session"]>;
  onRefresh: () => Promise<void>;
}) {
  const planView = useQuery(api.companion.getPlanView, {});
  const requestPlanGeneration = useMutation(api.coach.requestPlanGeneration);
  const createPlanFromGeneration = useMutation(api.coach.createPlanFromGeneration);
  const activateDraftPlan = useMutation(api.plans.activateDraftPlan);
  const updatePlanStatus = useMutation(api.plans.updatePlanStatus);
  const updatePlanPeakVolume = useMutation(api.companion.updatePlanPeakVolume);
  const changePlanGoal = useMutation(api.companion.changePlanGoal);
  const reportPlanInterruption = useMutation(api.companion.reportPlanInterruption);

  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [goalType, setGoalType] = useState<"race" | "nonRace">("race");
  const [goalLabel, setGoalLabel] = useState("5K");
  const [targetDate, setTargetDate] = useState("");
  const [goalTime, setGoalTime] = useState("");
  const [requestedWeeks, setRequestedWeeks] = useState("10");
  const [volumeMode, setVolumeMode] = useState<VolumeMode>(session.user.volumePreference);
  const [includeStrength, setIncludeStrength] = useState(session.user.strengthTrainingEnabled ?? false);
  const [strengthEquipment, setStrengthEquipment] = useState<Array<"bodyweight" | "dumbbells" | "kettlebells" | "bands" | "fullGym">>(
    (session.user.strengthEquipment ?? []) as Array<"bodyweight" | "dumbbells" | "kettlebells" | "bands" | "fullGym">,
  );

  const run = async (task: () => Promise<unknown>, success?: string) => {
    setStatus(null);
    setError(null);
    try {
      await task();
      if (success) {
        setStatus(success);
      }
      await onRefresh();
    } catch (taskError) {
      setError(String(taskError));
    }
  };

  const latestProposal = planView?.latestProposal ?? null;
  const activePlan = planView?.activePlan ?? null;

  return (
    <Screen title="Plan" subtitle="Create drafts, inspect week structure, and manage goal changes or interruptions.">
      {error ? <StatusMessage message={error} tone="error" /> : null}
      {status ? <StatusMessage message={status} tone="success" /> : null}

      <div className="two-column">
        <Card title="Create or refresh a draft" eyebrow="New plan">
          <div className="form-grid">
            <Field label="Goal type">
              <select value={goalType} onChange={(event) => setGoalType(event.target.value as "race" | "nonRace")}>
                <option value="race">Race</option>
                <option value="nonRace">Non-race</option>
              </select>
            </Field>
            <Field label="Goal label">
              <input value={goalLabel} onChange={(event) => setGoalLabel(event.target.value)} />
            </Field>
            <Field label="Target date">
              <input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
            </Field>
            <Field label="Goal time (seconds)">
              <input value={goalTime} onChange={(event) => setGoalTime(event.target.value)} />
            </Field>
            <Field label="Requested weeks">
              <input value={requestedWeeks} onChange={(event) => setRequestedWeeks(event.target.value)} />
            </Field>
            <Field label="Volume mode">
              <select value={volumeMode} onChange={(event) => setVolumeMode(event.target.value as VolumeMode)}>
                <option value="time">Time</option>
                <option value="distance">Distance</option>
              </select>
            </Field>
          </div>
          <label className="toggle">
            <input checked={includeStrength} onChange={(event) => setIncludeStrength(event.target.checked)} type="checkbox" />
            <span>Include strength work in the plan request.</span>
          </label>
          {includeStrength ? (
            <div className="pill-row wrap">
              {(["bodyweight", "dumbbells", "kettlebells", "bands", "fullGym"] as const).map((item) => (
                <button
                  key={item}
                  className={cx("pill-button", strengthEquipment.includes(item) && "pill-button-active")}
                  onClick={() =>
                    setStrengthEquipment((current) =>
                      current.includes(item) ? current.filter((entry) => entry !== item) : [...current, item],
                    )
                  }
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>
          ) : null}
          <Button
            onClick={() =>
              void run(
                async () =>
                  requestPlanGeneration({
                    goalType,
                    goalLabel,
                    targetDate: targetDate ? new Date(`${targetDate}T00:00:00`).getTime() : undefined,
                    goalTimeSeconds: goalTime ? Number(goalTime) : undefined,
                    volumeMode,
                    requestedNumberOfWeeks: goalType === "nonRace" ? Number(requestedWeeks) : undefined,
                    includeStrength,
                    strengthEquipment,
                  }),
                "Plan generation requested.",
              )
            }
          >
            Ask coach for a draft
          </Button>

          {latestProposal ? (
            <div className="proposal-block">
              <h3>Latest proposal status: {latestProposal.status}</h3>
              {latestProposal.result ? (
                <>
                  <p>Peak week {latestProposal.result.peakWeekVolume} · {latestProposal.result.numberOfWeeks} weeks</p>
                  <p>{latestProposal.result.rationale}</p>
                </>
              ) : null}
              {latestProposal.status === "succeeded" ? (
                <Button
                  onClick={() =>
                    void run(
                      async () => createPlanFromGeneration({ requestId: latestProposal._id }),
                      "Draft plan created.",
                    )
                  }
                >
                  Materialize draft
                </Button>
              ) : null}
            </div>
          ) : null}
        </Card>

        <Card title={activePlan ? activePlan.goalLabel : "No active or draft plan"} eyebrow="Current structure">
          {activePlan ? (
            <>
              <p>
                Status {activePlan.status} · Week {activePlan.currentWeekNumber ?? "—"} / {activePlan.numberOfWeeks}
              </p>
              <div className="metric-list">
                {activePlan.weeks.map((week) => (
                  <Link className="week-chip" key={String(week._id)} to={`/plan/week/${week.weekNumber}`}>
                    W{week.weekNumber} · {Math.round(week.targetVolumePercent * 100)}% · {week.emphasis}
                  </Link>
                ))}
              </div>

              <div className="button-row">
                {activePlan.status === "draft" ? (
                  <Button
                    onClick={() =>
                      void run(
                        async () =>
                          activateDraftPlan({
                            planId: activePlan._id,
                            canonicalTimeZoneId: Intl.DateTimeFormat().resolvedOptions().timeZone,
                          }),
                        "Draft activated.",
                      )
                    }
                  >
                    Activate draft
                  </Button>
                ) : null}
                {activePlan.status === "active" ? (
                  <Button
                    kind="secondary"
                    onClick={() =>
                      void run(
                        async () => reportPlanInterruption({ planId: activePlan._id, type: "life", note: "Paused from web companion." }),
                        "Interruption recorded.",
                      )
                    }
                  >
                    I need to pause
                  </Button>
                ) : null}
                {activePlan.status !== "completed" ? (
                  <Button
                    kind="secondary"
                    onClick={() =>
                      void run(
                        async () => updatePlanStatus({ planId: activePlan._id, status: activePlan.status === "active" ? "abandoned" : "completed" }),
                        "Plan status updated.",
                      )
                    }
                  >
                    {activePlan.status === "active" ? "Abandon plan" : "Complete plan"}
                  </Button>
                ) : null}
              </div>

              <div className="stack">
                <Button
                  kind="secondary"
                  onClick={() =>
                    void run(
                      async () =>
                        updatePlanPeakVolume({
                          planId: activePlan._id,
                          peakWeekVolume: activePlan.peakWeekVolume + (activePlan.volumeMode === "time" ? 15 : 1600),
                          reason: "Web adjustment",
                        }),
                      "Peak volume updated.",
                    )
                  }
                >
                  Increase peak volume slightly
                </Button>
                <Button
                  kind="secondary"
                  onClick={() =>
                    void run(
                      async () =>
                        changePlanGoal({
                          planId: activePlan._id,
                          goalType: "race",
                          goalLabel: `${activePlan.goalLabel} revised`,
                          targetDate: activePlan.targetDate ?? undefined,
                          goalTimeSeconds: activePlan.goalTimeSeconds ?? undefined,
                          reason: "Changed from web",
                        }),
                      "Goal change recorded.",
                    )
                  }
                >
                  Log a goal change
                </Button>
              </div>
            </>
          ) : (
            <p>No plan yet.</p>
          )}
        </Card>
      </div>
    </Screen>
  );
}

function WeekPage({
  session,
}: {
  session: NonNullable<Awaited<ReturnType<typeof useBootstrapSession>>["session"]>;
}) {
  const params = useParams();
  const weekNumber = Number(params.weekNumber ?? "1");
  const planView = useQuery(api.companion.getPlanView, {});
  const planId = planView?.activePlan?._id ?? planView?.draftPlans[0]?._id;
  const week = useQuery(api.companion.getWeekView, planId ? { planId, weekNumber } : "skip");
  const saveWeekAvailabilityOverride = useMutation(api.companion.saveWeekAvailabilityOverride);
  const clearWeekAvailabilityOverride = useMutation(api.companion.clearWeekAvailabilityOverride);
  const requestWeekDetailGeneration = useMutation(api.coach.requestWeekDetailGeneration);
  const toggleStrengthWorkout = useMutation(api.companion.toggleStrengthWorkout);
  const deleteRace = useMutation(api.companion.deleteRace);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (task: () => Promise<unknown>, success: string) => {
    setError(null);
    setMessage(null);
    try {
      await task();
      setMessage(success);
    } catch (taskError) {
      setError(String(taskError));
    }
  };

  return (
    <Screen title={`Week ${weekNumber}`} subtitle="Detailed agenda, races, and availability overrides for this week.">
      {message ? <StatusMessage message={message} tone="success" /> : null}
      {error ? <StatusMessage message={error} tone="error" /> : null}
      {!week ? <StatusMessage message="Loading week…" /> : null}
      {week ? (
        <>
          <Card title={`${week.plan.goalLabel} · ${week.week.emphasis}`} eyebrow={`Week ${week.week.weekNumber}`}>
            <p>
              {formatDateKey(week.week.weekStartDateKey)} to {formatDateKey(week.week.weekEndDateKey)} · Target{" "}
              {formatVolume(week.plan.volumeMode, week.week.targetVolumeAbsolute, session.user.unitPreference)}
            </p>
            {week.week.coachNotes ? <p>{week.week.coachNotes}</p> : null}
            {week.canGenerate && !week.week.generated ? (
              <Button onClick={() => void run(async () => requestWeekDetailGeneration({ planId: week.plan._id, weekNumber }), "Week generation requested.")}>
                Generate workouts
              </Button>
            ) : null}
          </Card>

          <Card title="Availability override" eyebrow="Schedule">
            {week.week.availabilityOverride ? <p>Current note: {week.week.availabilityOverride.note ?? "No note"}</p> : null}
            <Field label="Override note">
              <textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
            </Field>
            <div className="button-row">
              <Button
                onClick={() =>
                  void run(
                    async () =>
                      saveWeekAvailabilityOverride({
                        weekId: week.week._id,
                        preferredRunningDays: ["monday", "wednesday", "saturday"],
                        note,
                      }),
                    "Week override saved.",
                  )
                }
              >
                Save sample override
              </Button>
              <Button kind="secondary" onClick={() => void run(async () => clearWeekAvailabilityOverride({ weekId: week.week._id }), "Override cleared.")}>
                Clear override
              </Button>
            </div>
          </Card>

          <div className="two-column">
            <Card title="Running workouts" eyebrow="Agenda">
              <div className="stack">
                {week.workouts.map((workout) => (
                  <Link className="row-card link-card" key={String(workout._id)} to={`/plan/workout/${String(workout._id)}`}>
                    <div>
                      <strong>{formatWorkoutType(workout.type)}</strong>
                      <div>{formatDateKey(workout.scheduledDateKey)} · {formatVolume(week.plan.volumeMode, workout.absoluteVolume, session.user.unitPreference)}</div>
                    </div>
                    <span className="pill">{workout.execution?.matchStatus === "matched" ? "completed" : workout.status}</span>
                  </Link>
                ))}
              </div>
            </Card>

            <Card title="Strength and races" eyebrow="Extras">
              <div className="stack">
                {week.strengthWorkouts.map((workout) => (
                  <div className="row-card" key={String(workout._id)}>
                    <div>
                      <strong>{workout.title}</strong>
                      <div>{workout.plannedMinutes} min · {workout.status}</div>
                    </div>
                    <Button
                      kind="secondary"
                      onClick={() => void run(async () => toggleStrengthWorkout({ strengthWorkoutId: workout._id, completed: workout.status !== "completed" }), "Strength workout updated.")}
                    >
                      {workout.status === "completed" ? "Mark planned" : "Mark done"}
                    </Button>
                  </div>
                ))}
                {week.races.map((race) => (
                  <div className="row-card" key={String(race._id)}>
                    <div>
                      <strong>{race.label}</strong>
                      <div>{formatDateTime(race.plannedDate)} · {formatDistance(race.distanceMeters, session.user.unitPreference)}</div>
                    </div>
                    {!race.isPrimaryGoal && !race.actualTimeSeconds ? (
                      <Button kind="danger" onClick={() => void run(async () => deleteRace({ raceId: race._id }), "Race removed.")}>
                        Remove
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      ) : null}
    </Screen>
  );
}

function WorkoutPage({
  session,
}: {
  session: NonNullable<Awaited<ReturnType<typeof useBootstrapSession>>["session"]>;
}) {
  const params = useParams();
  const navigate = useNavigate();
  const workoutId = params.workoutId as Id<"workouts"> | undefined;
  const detail = useQuery(api.companion.getWorkoutView, workoutId ? { workoutId } : "skip");
  const skipWorkout = useMutation(api.workouts.skipWorkout);
  const rescheduleWorkout = useMutation(api.workouts.rescheduleWorkout);
  const bumpWorkout = useMutation(api.workouts.bumpWorkout);
  const submitCheckIn = useMutation(api.workouts.submitCheckIn);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rpe, setRpe] = useState("6");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (detail?.rescheduleOptions[0]) {
      setRescheduleDate(detail.rescheduleOptions[0]);
    }
  }, [detail?.rescheduleOptions]);

  const run = async (task: () => Promise<unknown>, success: string) => {
    setMessage(null);
    setError(null);
    try {
      await task();
      setMessage(success);
    } catch (taskError) {
      setError(String(taskError));
    }
  };

  return (
    <Screen title="Workout detail" subtitle="Plan, execute, bump, reschedule, or check in from the browser companion.">
      {message ? <StatusMessage message={message} tone="success" /> : null}
      {error ? <StatusMessage message={error} tone="error" /> : null}
      {!detail ? <StatusMessage message="Loading workout detail…" /> : null}
      {detail ? (
        <>
          <Card title={formatWorkoutType(detail.workout.type)} eyebrow={`Week ${detail.week.weekNumber}`}>
            <p>
              {formatDateKey(detail.workout.scheduledDateKey)} · {formatVolume(detail.plan.volumeMode, detail.workout.absoluteVolume, session.user.unitPreference)}
            </p>
            {detail.workout.notes ? <p>{detail.workout.notes}</p> : null}
            <div className="segment-list">
              {detail.workout.segments.map((segment, index) => (
                <div className="segment-row" key={`${segment.label}-${index}`}>
                  <strong>{segment.label}</strong>
                  <span>{segment.paceZone}</span>
                  <span>{segment.targetUnit === "seconds" ? formatDuration(segment.targetValue) : `${segment.targetValue} m`}</span>
                </div>
              ))}
            </div>
          </Card>

          <div className="two-column">
            <Card title="Actions" eyebrow="Adjust">
              <div className="stack">
                <Button onClick={() => void run(async () => skipWorkout({ workoutId: detail.workout._id, reason: "Skipped from web" }), "Workout skipped.")}>
                  Skip workout
                </Button>
                <Button kind="secondary" onClick={() => void run(async () => bumpWorkout({ workoutId: detail.workout._id }), "Workout bumped.")}>
                  Bump forward
                </Button>
                <Field label="Reschedule date">
                  <select value={rescheduleDate} onChange={(event) => setRescheduleDate(event.target.value)}>
                    {detail.rescheduleOptions.map((option) => (
                      <option key={option} value={option}>
                        {formatDateKey(option)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Button
                  kind="secondary"
                  onClick={() => void run(async () => rescheduleWorkout({ workoutId: detail.workout._id, newScheduledDateKey: rescheduleDate }), "Workout rescheduled.")}
                >
                  Save reschedule
                </Button>
              </div>
            </Card>

            <Card title="Check-in" eyebrow="Post-run">
              {detail.executionDetail ? (
                <>
                  <p>
                    Actual {formatDistance(detail.executionDetail.importedWorkout.distanceMeters, session.user.unitPreference)} ·{" "}
                    {formatDuration(detail.executionDetail.importedWorkout.durationSeconds)} · Pace{" "}
                    {formatPace(detail.executionDetail.importedWorkout.rawPaceSecondsPerMeter, session.user.unitPreference)}
                  </p>
                  <Field label="RPE">
                    <input value={rpe} onChange={(event) => setRpe(event.target.value)} />
                  </Field>
                  <Field label="Notes">
                    <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
                  </Field>
                  <Button
                    onClick={() =>
                      void run(
                        async () =>
                          submitCheckIn({
                            executionId: detail.executionDetail!.execution._id as Id<"workoutExecutions">,
                            rpe: Number(rpe),
                            modifiers: [],
                            notes,
                          }),
                        "Check-in submitted.",
                      )
                    }
                  >
                    Submit check-in
                  </Button>
                  {detail.executionDetail.execution.feedback.commentary ? (
                    <div className="inset">
                      <strong>Coach feedback</strong>
                      <p>{detail.executionDetail.execution.feedback.commentary}</p>
                    </div>
                  ) : null}
                </>
              ) : (
                <p>No matched execution yet. Review this workout from the History tab once it syncs from iPhone.</p>
              )}
            </Card>
          </div>

          <Button kind="secondary" onClick={() => navigate(-1)}>
            Back
          </Button>
        </>
      ) : null}
    </Screen>
  );
}

function HistoryPage({
  session,
}: {
  session: NonNullable<Awaited<ReturnType<typeof useBootstrapSession>>["session"]>;
}) {
  const [filter, setFilter] = useState<"all" | "matched" | "needsReview" | "unplanned">("all");
  const history = useQuery(api.companion.getHistoryView, { filter });

  return (
    <Screen title="History" subtitle="Synced iPhone workouts, match review, and structured execution detail.">
      <Card title="Import boundary" eyebrow="Managed on iPhone">
        <p>Workout import is still managed on iPhone. The browser companion only reviews and edits data already synced to Convex.</p>
      </Card>
      {!history ? <StatusMessage message="Loading history…" /> : null}
      {history ? (
        <>
          <Card title="Filters" eyebrow="Feed">
            <div className="pill-row wrap">
              {(["all", "matched", "needsReview", "unplanned"] as const).map((value) => (
                <button key={value} className={cx("pill-button", filter === value && "pill-button-active")} onClick={() => setFilter(value)} type="button">
                  {value}
                </button>
              ))}
            </div>
            <div className="metric-list">
              <span>Matched {history.counts.matched}</span>
              <span>Needs review {history.counts.needsReview}</span>
              <span>Unplanned {history.counts.unplanned}</span>
            </div>
          </Card>
          <Card title="Recent runs" eyebrow="Feed items">
            <div className="stack">
              {history.items.map((workout) => (
                <Link className="row-card link-card" key={String(workout._id)} to={`/history/${String(workout._id)}`}>
                  <div>
                    <strong>{formatDateTime(workout.startedAt)}</strong>
                    <div>
                      {formatDistance(workout.distanceMeters, session.user.unitPreference)} · {formatDuration(workout.durationSeconds)} · Pace{" "}
                      {formatPace(workout.rawPaceSecondsPerMeter, session.user.unitPreference)}
                    </div>
                  </div>
                  <span className="pill">{workout.status}</span>
                </Link>
              ))}
            </div>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function HistoryWorkoutPage({
  session,
}: {
  session: NonNullable<Awaited<ReturnType<typeof useBootstrapSession>>["session"]>;
}) {
  const params = useParams();
  const healthKitWorkoutId = params.healthKitWorkoutId as Id<"healthKitWorkouts"> | undefined;
  const detail = useQuery(api.companion.getHistoryWorkoutView, healthKitWorkoutId ? { healthKitWorkoutId } : "skip");
  const candidates = useQuery(api.workouts.getMatchCandidates, healthKitWorkoutId ? { healthKitWorkoutId } : "skip");
  const reconcileImportedWorkout = useMutation(api.workouts.reconcileImportedWorkout);
  const linkImportedWorkout = useMutation(api.workouts.linkImportedWorkout);
  const unlinkImportedWorkout = useMutation(api.workouts.unlinkImportedWorkout);
  const submitCheckIn = useMutation(api.workouts.submitCheckIn);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (task: () => Promise<unknown>, success: string) => {
    setMessage(null);
    setError(null);
    try {
      await task();
      setMessage(success);
    } catch (taskError) {
      setError(String(taskError));
    }
  };

  return (
    <Screen title="Imported run detail" subtitle="Review matching, check-in, and structured segment comparisons.">
      {message ? <StatusMessage message={message} tone="success" /> : null}
      {error ? <StatusMessage message={error} tone="error" /> : null}
      {!detail ? <StatusMessage message="Loading run detail…" /> : null}
      {detail ? (
        <>
          <Card title={formatDateTime(detail.workout.startedAt)} eyebrow="Run summary">
            <p>
              {formatDistance(detail.workout.distanceMeters, session.user.unitPreference)} · {formatDuration(detail.workout.durationSeconds)} · Pace{" "}
              {formatPace(detail.workout.rawPaceSecondsPerMeter, session.user.unitPreference)}
            </p>
            <div className="button-row">
              <Button kind="secondary" onClick={() => void run(async () => reconcileImportedWorkout({ healthKitWorkoutId: detail.workout._id }), "Auto-reconcile attempted.")}>
                Reconcile automatically
              </Button>
              {detail.executionDetail ? (
                <Button kind="secondary" onClick={() => void run(async () => unlinkImportedWorkout({ executionId: detail.executionDetail!.execution._id as Id<"workoutExecutions"> }), "Unlinked imported workout.")}>
                  Unlink
                </Button>
              ) : null}
            </div>
          </Card>

          <Card title="Match candidates" eyebrow="Review">
            <div className="stack">
              {candidates?.map((candidate) => (
                <div className="row-card" key={String(candidate.plannedWorkoutId)}>
                  <div>
                    <strong>{candidate.type}</strong>
                    <div>Week {candidate.weekNumber} · confidence {Math.round(candidate.confidence * 100)}%</div>
                  </div>
                  <Button
                    onClick={() =>
                      void run(
                        async () => linkImportedWorkout({ healthKitWorkoutId: detail.workout._id, plannedWorkoutId: candidate.plannedWorkoutId }),
                        "Workout linked.",
                      )
                    }
                  >
                    Link
                  </Button>
                </div>
              ))}
            </div>
          </Card>

          {detail.executionDetail ? (
            <Card title="Execution detail" eyebrow="Check-in and feedback">
              <p>
                Match status {detail.executionDetail.execution.matchStatus} · Check-in {detail.executionDetail.execution.checkInStatus}
              </p>
              {detail.executionDetail.segmentComparisons.length > 0 ? (
                <div className="stack">
                  {detail.executionDetail.segmentComparisons.map((segment, index) => (
                    <div className="inset" key={`${segment.plannedLabel}-${index}`}>
                      <strong>{segment.plannedLabel}</strong>
                      <p>Adherence {Math.round(segment.adherenceScore * 100)}%</p>
                    </div>
                  ))}
                </div>
              ) : null}
              <Button
                kind="secondary"
                onClick={() =>
                  void run(
                    async () =>
                      submitCheckIn({
                        executionId: detail.executionDetail!.execution._id as Id<"workoutExecutions">,
                        rpe: 6,
                        modifiers: [],
                        notes: "Checked in from web.",
                      }),
                    "Check-in submitted.",
                  )
                }
              >
                Submit quick check-in
              </Button>
              {detail.executionDetail.execution.feedback.commentary ? <p>{detail.executionDetail.execution.feedback.commentary}</p> : null}
            </Card>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

function CoachPage() {
  const coachView = useQuery(api.companion.getCoachView, {});
  const sendCoachMessage = useMutation(api.coach.sendCoachMessage);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runSend = async () => {
    setMessage(null);
    setError(null);
    try {
      await sendCoachMessage({ body: draft });
      setDraft("");
      setMessage("Message sent.");
    } catch (sendError) {
      setError(String(sendError));
    }
  };

  return (
    <Screen title="Coach" subtitle="Inbox, conversation, and end-of-plan assessment in one thread.">
      {message ? <StatusMessage message={message} tone="success" /> : null}
      {error ? <StatusMessage message={error} tone="error" /> : null}
      {!coachView ? <StatusMessage message="Loading coach…" /> : null}
      {coachView ? (
        <>
          <Card title="Current context" eyebrow="Now">
            <p>
              {coachView.activePlan ? `${coachView.activePlan.goalLabel} · week ${coachView.activePlan.currentWeekNumber ?? "—"}` : "No active plan"} ·{" "}
              {typeof coachView.currentVDOT === "number" ? `VDOT ${coachView.currentVDOT.toFixed(1)}` : "No VDOT"}
            </p>
          </Card>

          {coachView.latestAssessment ? (
            <Card title="Latest assessment" eyebrow="Assessment">
              <p>{coachView.latestAssessment.body}</p>
            </Card>
          ) : null}

          <Card title="Conversation" eyebrow="Messages">
            <div className="chat-list">
              {coachView.messages.map((entry) => (
                <div className={cx("chat-bubble", entry.author === "user" ? "chat-user" : "chat-coach")} key={String(entry._id)}>
                  <div className="chat-meta">
                    <strong>{entry.author === "user" ? "You" : "Coach"}</strong>
                    <span>{formatDateTime(entry.createdAt)}</span>
                  </div>
                  <p>{entry.body}</p>
                  {entry.cta ? <span className="pill">{entry.cta.label}</span> : null}
                </div>
              ))}
            </div>
          </Card>

          <Card title="Message coach" eyebrow="Compose">
            <Field label="Draft">
              <textarea rows={5} value={draft} onChange={(event) => setDraft(event.target.value)} />
            </Field>
            <Button onClick={() => void runSend()} disabled={draft.trim().length === 0}>
              Send
            </Button>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function SettingsPage({
  session,
  onRefresh,
}: {
  session: NonNullable<Awaited<ReturnType<typeof useBootstrapSession>>["session"]>;
  onRefresh: () => Promise<void>;
}) {
  const settings = useQuery(api.companion.getSettingsView, {});
  const updateName = useMutation(api.users.updateName);
  const updateUnitPreference = useMutation(api.users.updateUnitPreference);
  const updateVolumePreference = useMutation(api.users.updateVolumePreference);
  const updateTrackAccess = useMutation(api.users.updateTrackAccess);
  const updateRunningSchedule = useMutation(api.users.updateRunningSchedule);
  const updateCompetitiveness = useMutation(api.users.updateCompetitiveness);
  const updatePersonality = useMutation(api.users.updatePersonality);
  const updateStrengthPreferences = useMutation(api.users.updateStrengthPreferences);
  const upsertCourse = useMutation(api.companion.upsertCourse);
  const deleteCourse = useMutation(api.companion.deleteCourse);
  const upsertRace = useMutation(api.companion.upsertRace);
  const deleteRace = useMutation(api.companion.deleteRace);
  const exportData = useQuery(api.companion.exportData, {});
  const resetAppData = useMutation(api.users.resetAppData);
  const [name, setName] = useState(session.user.name);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (task: () => Promise<unknown>, success: string) => {
    setMessage(null);
    setError(null);
    try {
      await task();
      setMessage(success);
      await onRefresh();
    } catch (taskError) {
      setError(String(taskError));
    }
  };

  const downloadExport = () => {
    if (!exportData) {
      return;
    }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `slopmiles-export-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Screen title="Settings" subtitle="Profile, schedule, courses, race records, export, and reset.">
      {message ? <StatusMessage message={message} tone="success" /> : null}
      {error ? <StatusMessage message={error} tone="error" /> : null}
      {!settings ? <StatusMessage message="Loading settings…" /> : null}
      {settings ? (
        <>
          <div className="two-column">
            <Card title="Profile" eyebrow="Account">
              <div className="form-grid">
                <Field label="Name">
                  <input value={name} onChange={(event) => setName(event.target.value)} />
                </Field>
                <Field label="Units">
                  <select value={settings.user?.unitPreference ?? "system"} onChange={(event) => void run(async () => updateUnitPreference({ unitPreference: event.target.value as UnitPreference }), "Unit preference saved.")}>
                    <option value="system">System</option>
                    <option value="metric">Metric</option>
                    <option value="imperial">Imperial</option>
                  </select>
                </Field>
                <Field label="Volume mode">
                  <select value={settings.user?.volumePreference ?? "time"} onChange={(event) => void run(async () => updateVolumePreference({ volumePreference: event.target.value as VolumeMode }), "Volume preference saved.")}>
                    <option value="time">Time</option>
                    <option value="distance">Distance</option>
                  </select>
                </Field>
              </div>
              <div className="button-row">
                <Button onClick={() => void run(async () => updateName({ name }), "Name saved.")}>Save name</Button>
                <Button kind="secondary" onClick={() => void run(async () => updateTrackAccess({ trackAccess: !(settings.user?.trackAccess ?? false) }), "Track access updated.")}>
                  {settings.user?.trackAccess ? "Disable track access" : "Enable track access"}
                </Button>
              </div>
            </Card>

            <Card title="Coaching preferences" eyebrow="Coach">
              <div className="button-row">
                {(["conservative", "balanced", "aggressive"] as CompetitivenessLevel[]).map((level) => (
                  <button
                    key={level}
                    className={cx("pill-button", settings.competitiveness?.level === level && "pill-button-active")}
                    onClick={() => void run(async () => updateCompetitiveness({ level }), "Competitiveness updated.")}
                    type="button"
                  >
                    {level}
                  </button>
                ))}
              </div>
              <div className="button-row">
                {(["cheerleader", "noNonsense", "nerd", "zen"] as PersonalityPreset[]).map((preset) => (
                  <button
                    key={preset}
                    className={cx("pill-button", settings.personality?.name === preset && "pill-button-active")}
                    onClick={() => void run(async () => updatePersonality({ preset }), "Personality updated.")}
                    type="button"
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <label className="toggle">
                <input
                  checked={settings.strengthPreference.enabled}
                  onChange={(event) =>
                    void run(
                      async () =>
                        updateStrengthPreferences({
                          enabled: event.target.checked,
                          equipment: settings.strengthPreference.equipment,
                        }),
                      "Strength preference updated.",
                    )
                  }
                  type="checkbox"
                />
                <span>Include strength by default.</span>
              </label>
            </Card>
          </div>

          <Card title="Running schedule" eyebrow="Availability">
            <p>
              {settings.runningSchedule?.runningDaysPerWeek ?? 0} days per week on{" "}
              {settings.runningSchedule?.preferredRunningDays.join(", ") ?? "not set"}
            </p>
            <Button
              kind="secondary"
              onClick={() =>
                void run(
                  async () =>
                    updateRunningSchedule({
                      preferredRunningDays: ["monday", "wednesday", "friday", "saturday"],
                      runningDaysPerWeek: 4,
                      preferredLongRunDay: "saturday",
                      preferredQualityDays: ["wednesday", "friday"],
                    }),
                  "Sample running schedule saved.",
                )
              }
            >
              Save sample 4-day schedule
            </Button>
          </Card>

          <div className="two-column">
            <Card title="Courses" eyebrow="Measured routes">
              <div className="stack">
                {settings.courses.map((course) => (
                  <div className="row-card" key={String(course._id)}>
                    <div>
                      <strong>{course.name}</strong>
                      <div>{formatDistance(course.distanceMeters, session.user.unitPreference)} · {course.surface}</div>
                    </div>
                    <Button kind="danger" onClick={() => void run(async () => deleteCourse({ courseId: course._id }), "Course removed.")}>
                      Delete
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                kind="secondary"
                onClick={() =>
                  void run(
                    async () =>
                      upsertCourse({
                        name: "Neighborhood loop",
                        distanceMeters: 1609,
                        distanceUnit: "miles",
                        surface: "road",
                        notes: "Saved from web companion.",
                      }),
                    "Course saved.",
                  )
                }
              >
                Add sample course
              </Button>
            </Card>

            <Card title="Race results" eyebrow="History">
              <div className="stack">
                {settings.races.map((race) => (
                  <div className="row-card" key={String(race._id)}>
                    <div>
                      <strong>{race.label}</strong>
                      <div>{formatDateTime(race.plannedDate)} · {formatDistance(race.distanceMeters, session.user.unitPreference)} · {formatRaceTime(race.actualTimeSeconds)}</div>
                    </div>
                    {!race.isPrimaryGoal && !race.actualTimeSeconds ? (
                      <Button kind="danger" onClick={() => void run(async () => deleteRace({ raceId: race._id }), "Race removed.")}>
                        Delete
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
              <Button
                kind="secondary"
                onClick={() =>
                  void run(
                    async () =>
                      upsertRace({
                        label: "Tune-up 10K",
                        plannedDate: Date.now() + 21 * 24 * 60 * 60 * 1000,
                        distanceMeters: 10000,
                        goalTimeSeconds: 2700,
                        isPrimaryGoal: false,
                      }),
                    "Race saved.",
                  )
                }
              >
                Add sample race
              </Button>
            </Card>
          </div>

          <Card title="Data management" eyebrow="Portability">
            <div className="button-row">
              <Button onClick={downloadExport} disabled={!exportData}>
                Export my data
              </Button>
              <Button kind="danger" onClick={() => void run(async () => resetAppData({}), "App data reset.")}>
                Reset app
              </Button>
            </div>
            <p>Exports download as JSON in the browser. Reset clears app-owned data in Convex and restarts onboarding.</p>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

export function App() {
  const convexUrl = import.meta.env.VITE_CONVEX_URL;
  const client = useMemo(() => (convexUrl ? new ConvexReactClient(convexUrl) : null), [convexUrl]);

  if (!client) {
    return <MissingConfigScreen />;
  }

  return (
    <ConvexAuthProvider client={client}>
      <AuthLoading>
        <AppLoading />
      </AuthLoading>
      <Unauthenticated>
        <SignInScreen />
      </Unauthenticated>
      <Authenticated>
        <AuthenticatedApp />
      </Authenticated>
    </ConvexAuthProvider>
  );
}
