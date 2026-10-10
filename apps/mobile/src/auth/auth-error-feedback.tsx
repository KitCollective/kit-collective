import {
  AUTH_THROTTLE_BANNER_MESSAGE,
  IdentityAuthError,
  isIdentityAuthThrottleError,
} from "@/auth/identity-auth-error";
import { Banner } from "@/components/catalog-ui";

export type AuthErrorFeedback = {
  fieldError: string | null;
  showThrottleBanner: boolean;
};

export function resolveAuthErrorFeedback(
  error: unknown,
  fallbackMessage: string,
): AuthErrorFeedback {
  if (isIdentityAuthThrottleError(error)) {
    return { fieldError: null, showThrottleBanner: true };
  }
  if (error instanceof IdentityAuthError) {
    return { fieldError: error.message, showThrottleBanner: false };
  }
  return { fieldError: fallbackMessage, showThrottleBanner: false };
}

export function AuthThrottleBanner() {
  return <Banner tone="warning" message={AUTH_THROTTLE_BANNER_MESSAGE} />;
}
