import type { CaptureSessionState } from "./captureSessionTypes";

/** True once the hook has resolved whether a session exists for the current id. */
export function shouldConfirmRedirectAway(
  sessionId: string | undefined,
  state: CaptureSessionState | null,
  isSessionResolved: boolean,
): boolean {
  if (!isSessionResolved) {
    return false;
  }
  return !sessionId || !state;
}
