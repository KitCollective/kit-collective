import { identityVerifyRequestSchema, identityVerifyResponseSchema } from "@kit/api-contract";
import { type FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiFetch } from "../api/client.js";
import { BrandLogo } from "../brand/BrandLogo.js";

export function VerifyPage() {
  const [params] = useSearchParams();
  const [token, setToken] = useState(params.get("token") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload = identityVerifyRequestSchema.parse({ token });
      identityVerifyResponseSchema.parse(
        await apiFetch("/identity/verify", {
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
        <h1>Verify email</h1>
        {error ? <div className="banner-error">{error}</div> : null}
        {done ? (
          <p>Email verified. You can sign in.</p>
        ) : (
          <div className="field">
            <label htmlFor="token">Code</label>
            <input
              id="token"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              required
            />
          </div>
        )}
        {done ? (
          <Link to="/login" className="btn btn-primary">
            Sign in
          </Link>
        ) : (
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? "Verifying…" : "Verify"}
          </button>
        )}
      </form>
    </div>
  );
}
