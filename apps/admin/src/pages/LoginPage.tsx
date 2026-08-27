import { type FormEvent, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider.js";
import { BrandLogo } from "../brand/BrandLogo.js";

export function LoginPage() {
  const { login, user } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user?.role === "admin") {
    const redirectTo =
      typeof location.state === "object" &&
      location.state &&
      "from" in location.state &&
      typeof location.state.from === "string"
        ? location.state.from
        : "/stamdata";
    return <Navigate to={redirectTo} replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Sign in failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={onSubmit}>
        <BrandLogo variant="lockup" className="login-lockup" />
        <h1>Sign in</h1>
        {error ? <div className="banner-error">{error}</div> : null}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
