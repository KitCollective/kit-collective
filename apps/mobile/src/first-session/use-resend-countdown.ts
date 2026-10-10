import { useCallback, useEffect, useState } from "react";
import { nextCountdown } from "@/first-session/code-entry";

/** A countdown in whole seconds for Send igen; `start(n)` begins it and `clear()` ends it at once. */
export function useResendCountdown() {
  const [seconds, setSeconds] = useState(0);
  const running = seconds > 0;

  useEffect(() => {
    if (!running) {
      return;
    }
    const timer = setInterval(() => {
      setSeconds(nextCountdown);
    }, 1000);
    return () => clearInterval(timer);
  }, [running]);

  const start = useCallback((from: number) => setSeconds(from), []);
  const clear = useCallback(() => setSeconds(0), []);

  return { seconds, start, clear };
}
