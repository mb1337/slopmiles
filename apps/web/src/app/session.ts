import { useEffect, useState } from "react";
import { useMutation } from "convex/react";

import { api } from "../convex";

export type SessionPayload = Awaited<
  ReturnType<ReturnType<typeof useMutation<typeof api.users.bootstrapSession>>>
>;

export type SessionData = NonNullable<SessionPayload>;

export function useBootstrapSession() {
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

