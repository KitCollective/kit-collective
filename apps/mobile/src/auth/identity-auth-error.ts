export class IdentityAuthError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "IdentityAuthError";
    this.status = status;
  }
}

export function isIdentityAuthThrottleError(error: unknown): boolean {
  return error instanceof IdentityAuthError && error.status === 429;
}

// Design-system gap (KIT-181): Danish Auth throttle Banner copy is not locked in docs/design-system.md.
export const AUTH_THROTTLE_BANNER_MESSAGE = "For mange forsøg. Vent et øjeblik og prøv igen.";

export function identityAuthErrorFromResponse(
  response: Response,
  options: {
    invalidCredentialsMessage?: string;
    fallbackMessage: string;
  },
): IdentityAuthError {
  if (response.status === 429) {
    return new IdentityAuthError(429, AUTH_THROTTLE_BANNER_MESSAGE);
  }
  if (response.status === 401 && options.invalidCredentialsMessage) {
    return new IdentityAuthError(401, options.invalidCredentialsMessage);
  }
  return new IdentityAuthError(response.status, options.fallbackMessage);
}
