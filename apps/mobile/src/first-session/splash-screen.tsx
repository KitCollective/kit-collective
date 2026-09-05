import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { buttonLayoutStyles } from "@/components/button-layout";
import {
  SPLASH_CAPTION,
  SPLASH_LOGIN_LABEL,
  SPLASH_REGISTER_LABEL,
} from "@/first-session/door-copy";
import { SplashFrame } from "@/first-session/splash-frame";
import { useTypography } from "@/theme/brand-fonts";
import { color, motion, space, withAlpha } from "@/theme/tokens";
import { useReduceMotion } from "@/theme/use-reduce-motion";

const INVERSE_MUTED_ALPHA = 0.64;
const LOCK_EASE = Easing.bezier(0.4, 0, 0.2, 1);
const FALL_DISTANCE = space.insetLg * 3;
const INTRO_SETTLE = motion.slow + motion.base;

type SplashScreenProps = {
  onOpenLogin: () => void;
  onOpenRegister: () => void;
  onContinue?: () => void;
};

export function SplashScreen({ onOpenLogin, onOpenRegister, onContinue }: SplashScreenProps) {
  const typography = useTypography();
  const reduceMotion = useReduceMotion();
  const captionColor = withAlpha(color.contentInverse, INVERSE_MUTED_ALPHA);
  const [alive, setAlive] = useState(reduceMotion);
  const [interactive, setInteractive] = useState(reduceMotion);
  const [spinnerMounted, setSpinnerMounted] = useState(!reduceMotion);

  const spinnerY = useSharedValue(reduceMotion ? 0 : -FALL_DISTANCE);
  const spinnerOpacity = useSharedValue(reduceMotion ? 0 : 1);
  const captionOpacity = useSharedValue(reduceMotion ? 1 : 0);
  const dockOpacity = useSharedValue(reduceMotion ? 1 : 0);
  const dockY = useSharedValue(reduceMotion ? 0 : space.insetLg);

  useEffect(() => {
    if (reduceMotion) {
      spinnerY.set(0);
      spinnerOpacity.set(0);
      captionOpacity.set(1);
      dockOpacity.set(1);
      dockY.set(0);
      setAlive(true);
      setInteractive(true);
      setSpinnerMounted(false);
      return;
    }

    spinnerY.set(-FALL_DISTANCE);
    spinnerOpacity.set(1);
    captionOpacity.set(0);
    dockOpacity.set(0);
    dockY.set(space.insetLg);

    spinnerY.set(
      withTiming(0, {
        duration: motion.slow,
        easing: LOCK_EASE,
      }),
    );
    spinnerOpacity.set(
      withDelay(
        motion.base,
        withTiming(0, {
          duration: motion.fast,
          easing: LOCK_EASE,
        }),
      ),
    );
    captionOpacity.set(
      withDelay(
        motion.base,
        withTiming(1, {
          duration: motion.base,
          easing: LOCK_EASE,
        }),
      ),
    );
    dockY.set(
      withDelay(
        motion.slow,
        withTiming(0, {
          duration: motion.slow,
          easing: LOCK_EASE,
        }),
      ),
    );
    dockOpacity.set(
      withDelay(
        motion.slow,
        withTiming(1, {
          duration: motion.slow,
          easing: LOCK_EASE,
        }),
      ),
    );

    const settle = setTimeout(() => {
      setAlive(true);
      setInteractive(true);
      setSpinnerMounted(false);
    }, INTRO_SETTLE);

    return () => {
      clearTimeout(settle);
    };
  }, [captionOpacity, dockOpacity, dockY, reduceMotion, spinnerOpacity, spinnerY]);

  const spinnerStyle = useAnimatedStyle(() => ({
    opacity: spinnerOpacity.get(),
    transform: [{ translateY: spinnerY.get() }],
  }));
  const captionStyle = useAnimatedStyle(() => ({
    opacity: captionOpacity.get(),
  }));
  const dockStyle = useAnimatedStyle(() => ({
    opacity: dockOpacity.get(),
    transform: [{ translateY: dockY.get() }],
  }));

  return (
    <SplashFrame
      alive={alive}
      caption={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={SPLASH_CAPTION}
          disabled={!interactive}
          onPress={interactive ? onContinue : undefined}
          style={styles.captionHit}
        >
          <View style={styles.captionSlot}>
            {spinnerMounted ? (
              <Animated.View style={[styles.spinner, spinnerStyle]}>
                <ActivityIndicator color={color.contentInverse} />
              </Animated.View>
            ) : null}
            <Animated.View style={captionStyle}>
              <Text style={[typography.mono, { color: captionColor }]}>{SPLASH_CAPTION}</Text>
            </Animated.View>
          </View>
        </Pressable>
      }
      dock={
        <Animated.View style={[styles.dockStack, dockStyle]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={SPLASH_LOGIN_LABEL}
            disabled={!interactive}
            onPress={interactive ? onOpenLogin : undefined}
            style={({ pressed }) => [
              buttonLayoutStyles("fill"),
              styles.invertedLogin,
              pressed && interactive && styles.pressed,
            ]}
          >
            <Text style={[typography.label, { color: color.contentPrimary }]}>
              {SPLASH_LOGIN_LABEL}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={SPLASH_REGISTER_LABEL}
            disabled={!interactive}
            onPress={interactive ? onOpenRegister : undefined}
            style={({ pressed }) => [
              buttonLayoutStyles("fill"),
              styles.tertiaryInverse,
              pressed && interactive && styles.pressed,
            ]}
          >
            <Text style={[typography.label, { color: color.contentInverse }]}>
              {SPLASH_REGISTER_LABEL}
            </Text>
          </Pressable>
        </Animated.View>
      }
    />
  );
}

const styles = StyleSheet.create({
  captionHit: {
    flex: 1,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  captionSlot: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  spinner: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  dockStack: {
    gap: space.gapMd,
    alignSelf: "stretch",
  },
  invertedLogin: {
    backgroundColor: color.surface,
  },
  tertiaryInverse: {
    backgroundColor: "transparent",
  },
  pressed: {
    opacity: 0.9,
  },
});
