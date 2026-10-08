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
): () => void {
  const router = useRouter();
  const exitedRef = useRef(false);

  const exitToCollection = useCallback(() => {
    if (exitedRef.current) {
      return;
    }
    exitedRef.current = true;
    router.dismissTo(COLLECTION_ROUTE);
  }, [router]);

  useEffect(() => {
    if (shouldConfirmRedirectAway(sessionId, state, isSessionResolved)) {
      exitToCollection();
    }
  }, [exitToCollection, isSessionResolved, sessionId, state]);

  return exitToCollection;
}
