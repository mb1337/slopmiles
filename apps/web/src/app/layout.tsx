import { useAuthActions } from "@convex-dev/auth/react";
import { Link, Outlet, useLocation } from "react-router-dom";

import { type SessionData } from "./session";
import { Button, cx, formatFriendlyLabel } from "./shared";

export function AppShell({
  session,
  onRefresh,
}: {
  session: SessionData;
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
          <span>
            {formatFriendlyLabel(session.personality.name)} coach ·{" "}
            {formatFriendlyLabel(session.competitiveness.level)}
          </span>
        </div>
        <nav>
          {nav.map(([href, label]) => (
            <Link
              key={href}
              className={cx(
                "nav-link",
                location.pathname.startsWith(href) && "nav-link-active",
              )}
              to={href}
            >
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
            <span>
              {session.user.currentVDOT
                ? `VDOT ${session.user.currentVDOT.toFixed(1)}`
                : "No VDOT yet"}
            </span>
          </div>
          <div className="pill-row wrap">
            <span className="pill">{session.user.volumePreference}</span>
            <span className="pill">{session.user.unitPreference}</span>
            <span className="pill">
              {session.user.trackAccess ? "track available" : "road or time-based"}
            </span>
          </div>
        </div>
        <Outlet />
        <nav className="mobile-nav">
          {nav.map(([href, label]) => (
            <Link
              key={href}
              className={cx(
                "mobile-link",
                location.pathname.startsWith(href) && "mobile-link-active",
              )}
              to={href}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
