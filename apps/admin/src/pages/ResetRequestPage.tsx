import {
  identityPasswordResetAcceptedSchema,
  identityPasswordResetRequestSchema,
} from "@kit/api-contract";
import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/client.js";
import { BrandLogo } from "../brand/BrandLogo.js";

export function ResetRequestPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload = identityPasswordResetRequestSchema.parse({ email });
      identityPasswordResetAcceptedSchema.parse(
        await apiFetch("/identity/password-reset", {
          method: "POST",
          body: JSON.stringify(payload),
        }),
      );
      setDone(true);
    } catch {
      setError("Could not send a reset link.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={onSubmit}>
        <BrandLogo variant="lockup" className="login-lockup" />
        <h1>Reset password</h1>
        {error ? <div className="banner-error">{error}</div> : null}
        {done ? (
          <p>If an account exists, we sent a reset link.</p>
        ) : (
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
        )}
        {done ? (
          <Link to="/reset/complete" className="btn btn-primary">
            I have a code
          </Link>
        ) : (
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? "Sending…" : "Send link"}
          </button>
        )}
        <p>
          <Link to="/login">Back to sign in</Link>
        </p>
      </form>
    </div>
  );
}
