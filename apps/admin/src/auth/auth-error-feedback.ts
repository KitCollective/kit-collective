import { IdentityAuthError, isIdentityAuthThrottleError } from "./identity-auth-error.js";

export type AuthErrorFeedback = {
  error: string | null;
  showThrottleBanner: boolean;
};

export function resolveAuthErrorFeedback(
  error: unknown,
  invalidCredentialsMessage: string,
): AuthErrorFeedback {
  if (isIdentityAuthThrottleError(error)) {
    return { error: null, showThrottleBanner: true };
  }
  if (error instanceof IdentityAuthError) {
    return { error: error.message, showThrottleBanner: false };
  }
  return { error: invalidCredentialsMessage, showThrottleBanner: false };
}
