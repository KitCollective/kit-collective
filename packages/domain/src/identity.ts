export const HANDLE_STATUSES = ["yours", "available", "taken"] as const;
export type HandleStatus = (typeof HANDLE_STATUSES)[number];

/** Persisted Identity facts — login, logout, failure, reset, provider link, lockout. */
export const AUTH_EVENT_KINDS = [
  "login",
  "logout",
  "failure",
  "reset",
  "provider_link",
  "lockout",
] as const;
export type AuthEventKind = (typeof AUTH_EVENT_KINDS)[number];

/** Public collector handle — unique, never the email. */
export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 30;

export const HANDLE_PATTERN = /^[a-z][a-z0-9_]*$/;
