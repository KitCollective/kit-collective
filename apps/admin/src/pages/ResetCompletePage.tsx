import {
  identityPasswordResetAcceptedSchema,
  identityPasswordResetCompleteSchema,
} from "@kit/api-contract";
import { type FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiFetch } from "../api/client.js";
import { BrandLogo } from "../brand/BrandLogo.js";

export function ResetCompletePage() {
  const [params] = useSearchParams();
  const [token, setToken] = useState(params.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload = identityPasswordResetCompleteSchema.parse({ token, password });
      identityPasswordResetAcceptedSchema.parse(
        await apiFetch("/identity/password-reset/complete", {
          method: "POST",
          body: JSON.stringify(payload),
        }),
      );
      setDone(true);
    } catch {
      setError("This link is invalid or expired.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={onSubmit}>
        <BrandLogo variant="lockup" className="login-lockup" />
        <h1>New password</h1>
        {error ? <div className="banner-error">{error}</div> : null}
        {done ? (
          <p>Password updated. Other sessions were revoked.</p>
        ) : (
          <>
            <div className="field">
              <label htmlFor="token">Code</label>
              <input
                id="token"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="password">New password</label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
              />
            </div>
          </>
        )}
        {done ? (
          <Link to="/login" className="btn btn-primary">
            Sign in
          </Link>
        ) : (
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? "Saving…" : "Save password"}
          </button>
        )}
      </form>
    </div>
  );
}
