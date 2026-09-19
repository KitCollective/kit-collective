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

export const AUTH_THROTTLE_BANNER_MESSAGE = "Too many attempts. Wait a moment and try again.";

export async function throwIdentityAuthError(
  response: Response,
  options: {
    invalidCredentialsMessage?: string;
    fallbackMessage: string;
  },
): Promise<never> {
  if (response.status === 429) {
    throw new IdentityAuthError(429, AUTH_THROTTLE_BANNER_MESSAGE);
  }
  if (response.status === 401 && options.invalidCredentialsMessage) {
    throw new IdentityAuthError(401, options.invalidCredentialsMessage);
  }
  const message = await response.text();
  throw new IdentityAuthError(response.status, message || options.fallbackMessage);
}
