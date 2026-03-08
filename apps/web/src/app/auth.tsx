import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";

import { Button, Card, Field, StatusMessage } from "./shared";

export function MissingConfigScreen() {
  return (
    <main className="auth-screen">
      <Card title="Missing web configuration" eyebrow="Configuration">
        <p>
          Set <code>VITE_CONVEX_URL</code> for the web client before starting the
          app.
        </p>
      </Card>
    </main>
  );
}

export function SignInScreen() {
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
          <h1>See what matters, take action fast, and keep your training moving.</h1>
          <p>
            Use the web app to review your plan, fix schedule issues, match runs,
            and talk to your coach without hunting through a bunch of screens.
          </p>
          <div className="button-row wrap">
            <Button disabled={appleBusy || otpBusy} onClick={() => void handleSignIn()}>
              {appleBusy ? "Redirecting…" : "Sign in with Apple"}
            </Button>
          </div>
          <div className="auth-divider">
            <span>or use an email code</span>
          </div>
          <Field label="Email">
            <input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              type="email"
              value={email}
            />
          </Field>
          {otpStep === "verify" ? (
            <Field label="Verification code">
              <input
                autoComplete="one-time-code"
                inputMode="numeric"
                onChange={(event) => setCode(event.target.value)}
                placeholder="123456"
                value={code}
              />
            </Field>
          ) : null}
          {info ? <StatusMessage message={info} tone="success" /> : null}
          {error ? <StatusMessage message={error} tone="error" /> : null}
          {otpStep === "request" ? (
            <Button
              disabled={otpBusy || appleBusy || email.trim().length === 0}
              onClick={() => void handleSendCode()}
            >
              {otpBusy ? "Sending…" : "Send code"}
            </Button>
          ) : (
            <div className="button-row wrap">
              <Button
                disabled={
                  otpBusy ||
                  appleBusy ||
                  email.trim().length === 0 ||
                  code.trim().length === 0
                }
                onClick={() => void handleVerifyCode()}
              >
                {otpBusy ? "Verifying…" : "Verify code"}
              </Button>
              <Button
                disabled={otpBusy || appleBusy}
                kind="secondary"
                onClick={() => {
                  setOtpStep("request");
                  setCode("");
                  setInfo(null);
                  setError(null);
                }}
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

export function AppLoading() {
  return (
    <main className="auth-screen">
      <Card title="Restoring session" eyebrow="Authentication">
        <p>Connecting to Convex and restoring your secure session.</p>
      </Card>
    </main>
  );
}

