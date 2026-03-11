import { useMemo } from "react";
import {
  Authenticated,
  AuthLoading,
  ConvexReactClient,
  Unauthenticated,
} from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AppLoading, MissingConfigScreen, SignInScreen } from "./app/auth";
import { AppShell } from "./app/layout";
import {
  CoachPage,
  DashboardPage,
  HistoryPage,
  HistoryWorkoutPage,
  OnboardingPage,
  PastPlanPage,
  PlanPage,
  SettingsPage,
  WeekPage,
  WorkoutPage,
} from "./app/pages";
import { useBootstrapSession } from "./app/session";
import { Button, Card } from "./app/shared";

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
          element={
            <Navigate
              replace
              to={session.onboardingState.isComplete ? "/dashboard" : "/onboarding"}
            />
          }
        />
        <Route
          path="/onboarding"
          element={<OnboardingPage onRefresh={refresh} session={session} />}
        />
        <Route
          element={
            session.onboardingState.isComplete ? (
              <AppShell onRefresh={refresh} session={session} />
            ) : (
              <Navigate replace to="/onboarding" />
            )
          }
        >
          <Route path="/dashboard" element={<DashboardPage session={session} />} />
          <Route path="/plan" element={<PlanPage onRefresh={refresh} session={session} />} />
          <Route path="/plan/history/:planId" element={<PastPlanPage session={session} />} />
          <Route path="/plan/week/:weekNumber" element={<WeekPage session={session} />} />
          <Route path="/plan/workout/:workoutId" element={<WorkoutPage session={session} />} />
          <Route path="/history" element={<HistoryPage session={session} />} />
          <Route
            path="/history/:healthKitWorkoutId"
            element={<HistoryWorkoutPage session={session} />}
          />
          <Route path="/coach" element={<CoachPage />} />
          <Route path="/settings" element={<SettingsPage onRefresh={refresh} session={session} />} />
        </Route>
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}

export function App() {
  const convexUrl = import.meta.env.VITE_CONVEX_URL;
  const client = useMemo(
    () => (convexUrl ? new ConvexReactClient(convexUrl) : null),
    [convexUrl],
  );

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
