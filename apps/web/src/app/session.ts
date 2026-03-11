import { useEffect, useState } from "react";
import { useMutation } from "convex/react";

import { api } from "../convex";

export type SessionPayload = Awaited<
  ReturnType<ReturnType<typeof useMutation<typeof api.session.bootstrapSession>>>
>;

export type SessionData = NonNullable<SessionPayload>;

export function useBootstrapSession() {
  const bootstrap = useMutation(api.session.bootstrapSession);
  const retryDuePlanAssessments = useMutation(api.coach.retryDuePlanAssessments);
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setError(null);
    setLoading(true);
    try {
      const payload = await bootstrap({});
      setSession(payload);
      if (payload?.onboardingState?.isComplete) {
        try {
          await retryDuePlanAssessments({});
        } catch {
          // Session bootstrap should still succeed if retry scheduling fails.
        }
      }
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

  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible") {
        void retryDuePlanAssessments({});
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [retryDuePlanAssessments]);

  return { session, loading, error, refresh };
}
