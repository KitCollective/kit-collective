import { HANDLE_MAX_LENGTH, HANDLE_MIN_LENGTH, HANDLE_PATTERN } from "@kit/domain";

export function baseHandleFromEmail(email: string): string {
  const localPart = email.split("@")[0] ?? "user";
  let handle = localPart
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!handle || !/^[a-z]/.test(handle)) {
    handle = `u_${handle}`.replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  }

  if (!handle || !HANDLE_PATTERN.test(handle)) {
    handle = "user";
  }

  if (handle.length < HANDLE_MIN_LENGTH) {
    handle = `u_${handle}`.replace(/_+/g, "_").slice(0, HANDLE_MAX_LENGTH);
  }

  if (handle.length < HANDLE_MIN_LENGTH || !HANDLE_PATTERN.test(handle)) {
    handle = "user";
  }

  return handle.slice(0, HANDLE_MAX_LENGTH - 4);
}

export function nextHandleCandidate(base: string, attempt: number): string {
  if (attempt === 0) {
    return base.slice(0, HANDLE_MAX_LENGTH);
  }

  const suffix = String(attempt + 1);
  const trimmedBase = base.slice(0, Math.max(1, HANDLE_MAX_LENGTH - suffix.length));
  return `${trimmedBase}${suffix}`.slice(0, HANDLE_MAX_LENGTH);
}

export function isHandleEmail(handle: string, email: string): boolean {
  return handle.toLowerCase() === email.toLowerCase();
}

export function avatarObjectKeyForUser(userId: string): string {
  return `user/${userId}/avatar.jpg`;
}

export function avatarUrlForUser(): string {
  return "/v1/identity/avatar";
}
