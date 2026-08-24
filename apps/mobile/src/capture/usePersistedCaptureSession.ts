import { useCallback, useEffect, useState } from "react";
import { loadPersistedCaptureSession, withPersistedCaptureSession } from "./captureFlow";
import type { CaptureSessionState } from "./captureSessionTypes";

export { shouldConfirmRedirectAway } from "./confirmRedirect";

export function usePersistedCaptureSession(sessionId: string | undefined) {
  const [state, setState] = useState<CaptureSessionState | null>(() => {
    if (!sessionId) {
      return null;
    }
    return loadPersistedCaptureSession(sessionId);
  });
  const [isSessionResolved, setIsSessionResolved] = useState(() => sessionId !== undefined);

  const refresh = useCallback(() => {
    if (!sessionId) {
      setState(null);
      setIsSessionResolved(true);
      return null;
    }

    const loaded = loadPersistedCaptureSession(sessionId);
    setState(loaded);
    setIsSessionResolved(true);
    return loaded;
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) {
      setState(null);
      setIsSessionResolved(true);
      return;
    }
    refresh();
  }, [refresh, sessionId]);

  const mutate = useCallback(
    (updater: (current: CaptureSessionState) => CaptureSessionState) => {
      if (!sessionId) {
        return null;
      }

      const current = loadPersistedCaptureSession(sessionId);
      if (!current) {
        setState(null);
        return null;
      }

      const next = updater(withPersistedCaptureSession(sessionId, current));
      setState(next);
      return next;
    },
    [sessionId],
  );

  return { state, isSessionResolved, refresh, mutate };
}
