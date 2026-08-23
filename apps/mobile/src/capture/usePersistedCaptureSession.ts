import { useCallback, useEffect, useState } from "react";
import { loadPersistedCaptureSession, withPersistedCaptureSession } from "./captureFlow";
import type { CaptureSessionState } from "./captureSessionTypes";

export function usePersistedCaptureSession(sessionId: string | undefined) {
  const [state, setState] = useState<CaptureSessionState | null>(null);

  const refresh = useCallback(() => {
    if (!sessionId) {
      setState(null);
      return null;
    }

    const loaded = loadPersistedCaptureSession(sessionId);
    setState(loaded);
    return loaded;
  }, [sessionId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

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

  return { state, refresh, mutate };
}
