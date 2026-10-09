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

/**
 * Like `useReduceMotion`, but `null` until the OS has answered. Screens with
 * brand-moment motion wait for the answer so they never start full-motion and
 * then restart as a still.
 */
export function useReduceMotionSetting(): boolean | null {
  const [setting, setSetting] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) {
        setSetting(enabled);
      }
    });

    const subscription = AccessibilityInfo.addEventListener?.("reduceMotionChanged", setSetting);

    return () => {
      active = false;
      subscription?.remove?.();
    };
  }, []);

  return setting;
}
