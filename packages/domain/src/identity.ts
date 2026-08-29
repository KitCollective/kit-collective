export const HANDLE_STATUSES = ["yours", "available", "taken"] as const;
export type HandleStatus = (typeof HANDLE_STATUSES)[number];

/** Public collector handle — unique, never the email. */
export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 30;

export const HANDLE_PATTERN = /^[a-z][a-z0-9_]*$/;
