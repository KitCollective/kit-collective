import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import type { CaptureSessionState } from "./captureSessionTypes";
import { shouldConfirmRedirectAway } from "./confirmRedirect";

const COLLECTION_ROUTE = "/(tabs)/collection";

/**
 * Owns Confirm's single modal exit. Manual close and session-loss redirects share the
 * same idempotent dismiss, so concurrent callers cannot produce a double navigation.
 */
export function useConfirmExit(
  sessionId: string | undefined,
  state: CaptureSessionState | null,
  isSessionResolved: boolean,
  /** Runs once, on the collector's own Luk, before the modal leaves (parks an overview session). */
  onClose?: () => void,
): () => void {
  const router = useRouter();
  const exitedRef = useRef(false);

  const dismiss = useCallback(() => {
    if (exitedRef.current) {
      return;
    }
    exitedRef.current = true;
    router.dismissTo(COLLECTION_ROUTE);
  }, [router]);

  const exitToCollection = useCallback(() => {
    if (!exitedRef.current) {
      onClose?.();
    }
    dismiss();
  }, [dismiss, onClose]);

  useEffect(() => {
    if (shouldConfirmRedirectAway(sessionId, state, isSessionResolved)) {
      dismiss();
    }
  }, [dismiss, isSessionResolved, sessionId, state]);

  return exitToCollection;
}
