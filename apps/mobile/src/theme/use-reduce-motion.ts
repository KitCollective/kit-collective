import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/** The setting right now, for code that cannot wait for the hook's first answer. */
export function readReduceMotion(): Promise<boolean> {
  return AccessibilityInfo.isReduceMotionEnabled();
}

export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);

    const subscription = AccessibilityInfo.addEventListener?.(
      "reduceMotionChanged",
      setReduceMotion,
    );

    return () => {
      subscription?.remove?.();
    };
  }, []);

  return reduceMotion;
}
