import { useEffect, useRef } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { BRAND_MOMENTS } from "@/first-session/brand-moments";
import { motion, radius, withAlpha } from "@/theme/tokens";
import { useReduceMotion } from "@/theme/use-reduce-motion";
import { useTheme } from "@/theme/use-theme";

const LOCK_EASE = Easing.bezier(0.4, 0, 0.2, 1);
const SCAN_LINE_HEIGHT = 2;

type ConfirmScanLineProps = {
  /** True while the first identity read of this photo is running. */
  active: boolean;
  /** Height of the photo the line travels over. */
  height: number;
};

/**
 * Vision at work on the front photo (docs/design-system.md, Brand moments): a scan line passes
 * over the photo while the first read runs, and the crest ring pulses once when it ends. The
 * parent decides *whether* via the scan-line ledger (once per photo); under Reduce Motion this
 * renders nothing, so the end state is the same.
 */
export function ConfirmScanLine({ active, height }: ConfirmScanLineProps) {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const scanY = useSharedValue(0);
  const scanOpacity = useSharedValue(0);
  const ringOpacity = useSharedValue(0);
  const wasActive = useRef(false);

  useEffect(() => {
    if (reduceMotion) {
      return;
    }
    if (active) {
      wasActive.current = true;
      scanOpacity.set(withTiming(1, { duration: motion.fast }));
      scanY.set(0);
      scanY.set(
        withRepeat(
          withTiming(height - SCAN_LINE_HEIGHT, {
            duration: BRAND_MOMENTS.visionAtWork.scanPassMs,
            easing: LOCK_EASE,
          }),
          -1,
          false,
        ),
      );
      return;
    }
    cancelAnimation(scanY);
    scanOpacity.set(withTiming(0, { duration: motion.fast }));
    if (wasActive.current) {
      wasActive.current = false;
      ringOpacity.set(
        withSequence(
          withTiming(1, { duration: motion.fast, easing: LOCK_EASE }),
          withTiming(0, { duration: motion.base, easing: LOCK_EASE }),
        ),
      );
    }
  }, [active, height, reduceMotion, ringOpacity, scanOpacity, scanY]);

  const scanStyle = useAnimatedStyle(() => ({
    opacity: scanOpacity.get(),
    transform: [{ translateY: scanY.get() }],
  }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: ringOpacity.get() }));

  if (reduceMotion) {
    return null;
  }

  return (
    <>
      <Animated.View
        pointerEvents="none"
        accessibilityElementsHidden
        style={[
          styles.scanLine,
          { backgroundColor: withAlpha(theme.contentInverse, 0.8) },
          scanStyle,
        ]}
      />
      <Animated.View
        pointerEvents="none"
        accessibilityElementsHidden
        style={[styles.ring, { borderColor: theme.contentInverse }, ringStyle]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  scanLine: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: SCAN_LINE_HEIGHT,
  },
  ring: {
    ...StyleSheet.absoluteFill,
    borderWidth: 2,
    borderRadius: radius.md,
  },
});
