import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { CONFIRM_VIEWER_WIDTH } from "@/components/photo-slot";
import { useTypography } from "@/theme/brand-fonts";
import { motion, space } from "@/theme/tokens";
import { useReduceMotion } from "@/theme/use-reduce-motion";
import { useTheme } from "@/theme/use-theme";

export const GROUPING_WAIT_LINES = [
  "Forsøger at gruppere dine trøjer",
  "Du kan starte grupperingen selv",
] as const;
export const GROUPING_WAIT_CYCLE_MS = motion.slow * 5;
const LOCK_EASE = Easing.bezier(0.4, 0, 0.2, 1);
const CANVAS_HEIGHT = (CONFIRM_VIEWER_WIDTH * 5) / 4;
const HOP = -space.insetSm;

/**
 * Same 4:5 viewer canvas, no slot frames. A small hop plus rotating copy
 * while grouping has not yet rolled a photo into the strip.
 */
export function ConfirmGroupingWait() {
  const theme = useTheme();
  const typography = useTypography();
  const reduceMotion = useReduceMotion();
  const [lineIndex, setLineIndex] = useState(0);
  const hop = useSharedValue(0);
  const textOpacity = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) {
      hop.set(0);
      textOpacity.set(1);
      return;
    }

    hop.set(
      withRepeat(
        withTiming(HOP, { duration: motion.base, easing: LOCK_EASE }),
        -1,
        true,
      ),
    );

    let swapTimer: ReturnType<typeof setTimeout> | undefined;
    const cycle = setInterval(() => {
      textOpacity.set(withTiming(0, { duration: motion.fast, easing: LOCK_EASE }));
      swapTimer = setTimeout(() => {
        setLineIndex((current) => (current + 1) % GROUPING_WAIT_LINES.length);
        textOpacity.set(withTiming(1, { duration: motion.fast, easing: LOCK_EASE }));
      }, motion.fast);
    }, GROUPING_WAIT_CYCLE_MS);

    return () => {
      cancelAnimation(hop);
      cancelAnimation(textOpacity);
      clearInterval(cycle);
      if (swapTimer) {
        clearTimeout(swapTimer);
      }
    };
  }, [hop, reduceMotion, textOpacity]);

  const hopStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: hop.get() }],
  }));
  const lineStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.get(),
  }));

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
      accessibilityLabel={`${GROUPING_WAIT_LINES[0]}. ${GROUPING_WAIT_LINES[1]}.`}
      style={[styles.canvas, { height: CANVAS_HEIGHT }]}
    >
      <Animated.View
        style={[styles.dot, { backgroundColor: theme.fillPrimary }, hopStyle]}
        accessibilityElementsHidden
      />
      {reduceMotion ? (
        <View style={styles.copy}>
          {GROUPING_WAIT_LINES.map((line) => (
            <Text
              key={line}
              style={[typography.caption, styles.line, { color: theme.contentSecondary }]}
            >
              {line}
            </Text>
          ))}
        </View>
      ) : (
        <Animated.Text
          style={[
            typography.caption,
            styles.line,
            { color: theme.contentSecondary },
            lineStyle,
          ]}
        >
          {GROUPING_WAIT_LINES[lineIndex]}
        </Animated.Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    width: "100%",
    minWidth: CONFIRM_VIEWER_WIDTH,
    alignItems: "center",
    justifyContent: "center",
    gap: space.gapMd,
    paddingHorizontal: space.insetLg,
  },
  dot: {
    width: space.insetSm,
    height: space.insetSm,
    borderRadius: space.insetSm,
  },
  copy: {
    alignItems: "center",
    gap: space.gapSm,
  },
  line: {
    textAlign: "center",
  },
});
