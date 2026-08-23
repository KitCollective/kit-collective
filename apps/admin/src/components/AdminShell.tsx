import { type KeyboardEvent, useCallback } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider.js";

const TABS = [
  {
    to: "/stamdata",
    label: "Stamdata",
    match: (pathname: string) => pathname.startsWith("/stamdata"),
  },
  {
    to: "/collectors",
    label: "Collectors",
    match: (pathname: string) => pathname.startsWith("/collectors"),
  },
] as const;

export function AdminShell() {
  const { logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleTabKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }

      const tabElements = event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]');
      const tabs = [...tabElements];
      const activeElement = document.activeElement;
      const activeIndex = activeElement instanceof HTMLElement ? tabs.indexOf(activeElement) : -1;
      if (activeIndex === -1) {
        return;
      }

      event.preventDefault();
      const delta = event.key === "ArrowRight" ? 1 : -1;
      const nextIndex = activeIndex + delta;
      if (nextIndex < 0 || nextIndex >= tabs.length) {
        return;
      }

      const nextTab = tabs[nextIndex];
      nextTab.focus();
      navigate(TABS[nextIndex].to);
    },
    [navigate],
  );

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="app-title">KitCollective Admin</h1>
        <button type="button" className="btn btn-secondary" onClick={logout}>
          Sign out
        </button>
      </header>

      <div
        className="top-tabs"
        role="tablist"
        aria-label="Admin sections"
        onKeyDown={handleTabKeyDown}
      >
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            role="tab"
            aria-selected={tab.match(location.pathname)}
            className="top-tab"
            end={tab.to === "/collectors"}
          >
            {tab.label}
          </NavLink>
        ))}
      </div>

      <Outlet />
    </div>
  );
}
