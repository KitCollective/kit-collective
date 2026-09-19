import { useEffect } from "react";
import { StyleSheet, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { motion } from "@/theme/tokens";
import { useReduceMotion } from "@/theme/use-reduce-motion";

/**
 * Mid stays at 0.55 so the bone never dissolves into canvas. Call sites pass
 * an already-muted fill (`SKELETON_BONE_ALPHA` on `fill.primary`).
 */
export const ANALYZING_PULSE_MS = motion.slow * 5;
export const SKELETON_BONE_ALPHA = 0.18;
const PULSE_EASE = Easing.bezier(0.4, 0, 0.6, 1);
export const REST_OPACITY = 1;
export const MID_OPACITY = 0.55;

type ConfirmAnalyzingPulseProps = {
  color: string;
  style?: ViewStyle;
};

export function ConfirmAnalyzingPulse({ color, style }: ConfirmAnalyzingPulseProps) {
  const reduceMotion = useReduceMotion();
  const opacity = useSharedValue(REST_OPACITY);

  useEffect(() => {
    if (reduceMotion) {
      opacity.set(REST_OPACITY);
      return;
    }

    opacity.set(REST_OPACITY);
    opacity.set(
      withRepeat(
        withTiming(MID_OPACITY, {
          duration: ANALYZING_PULSE_MS / 2,
          easing: PULSE_EASE,
        }),
        -1,
        true,
      ),
    );

    return () => {
      cancelAnimation(opacity);
    };
  }, [opacity, reduceMotion]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
  }));

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.fill, { backgroundColor: color }, pulseStyle, style]}
    />
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFill,
  },
});
