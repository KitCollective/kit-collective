import type { IdentityLinkedProvider } from "@kit/api-contract";
import { type FormEvent, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider.js";
import {
  requestSocialIdToken as defaultRequestSocialIdToken,
  type SocialIdTokenRequester,
} from "../auth/social-id-token.js";
import { BrandLogo } from "../brand/BrandLogo.js";

type LoginPageProps = {
  requestSocialIdToken?: SocialIdTokenRequester;
};

export function LoginPage({
  requestSocialIdToken = defaultRequestSocialIdToken,
}: LoginPageProps = {}) {
  const { login, loginSocial, user } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<"password" | "social" | null>(null);
  const busy = submitting !== null;

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
    setSubmitting("password");
    setError(null);
    try {
      await login(email, password);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Sign in failed");
    } finally {
      setSubmitting(null);
    }
  }

  async function onSocial(provider: IdentityLinkedProvider) {
    setSubmitting("social");
    setError(null);
    try {
      const idToken = await requestSocialIdToken(provider);
      await loginSocial(provider, idToken);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Sign in failed");
    } finally {
      setSubmitting(null);
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
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {submitting === "password" ? "Signing in…" : "Sign in"}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => void onSocial("google")}
        >
          Continue with Google
        </button>
        <button
          type="button"
          className="btn btn-tertiary"
          disabled={busy}
          onClick={() => void onSocial("facebook")}
        >
          Continue with Facebook
        </button>
        <p>
          <Link to="/reset">Forgot password</Link>
          {" · "}
          <Link to="/verify">Verify email</Link>
        </p>
      </form>
    </div>
  );
}
