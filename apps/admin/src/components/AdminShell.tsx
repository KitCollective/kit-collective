import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider.js";

export function AdminShell() {
  const { logout } = useAuth();

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="app-title">KitCollective Admin</h1>
        <button type="button" className="btn btn-secondary" onClick={logout}>
          Sign out
        </button>
      </header>

      <nav className="top-tabs" aria-label="Admin sections">
        <NavLink to="/stamdata" className={({ isActive }) => `top-tab${isActive ? "" : ""}`} end>
          Stamdata
        </NavLink>
        <NavLink to="/collectors" className="top-tab">
          Collectors
        </NavLink>
      </nav>

      <Outlet />
    </div>
  );
}
