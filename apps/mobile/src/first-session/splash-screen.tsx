import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
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
const SWIPE_ACTIVATE = 24;
const SWIPE_COMMIT = 80;

function lockTiming(to: number, duration: number) {
  return withTiming(to, { duration, easing: LOCK_EASE });
}

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
    function land() {
      setAlive(true);
      setInteractive(true);
      setSpinnerMounted(false);
    }

    function settleValues() {
      spinnerY.set(0);
      spinnerOpacity.set(0);
      captionOpacity.set(1);
      dockOpacity.set(1);
      dockY.set(0);
    }

    if (reduceMotion) {
      settleValues();
      land();
      return;
    }

    spinnerY.set(-FALL_DISTANCE);
    spinnerOpacity.set(1);
    captionOpacity.set(0);
    dockOpacity.set(0);
    dockY.set(space.insetLg);

    spinnerY.set(lockTiming(0, motion.slow));
    spinnerOpacity.set(withDelay(motion.base, lockTiming(0, motion.fast)));
    captionOpacity.set(withDelay(motion.base, lockTiming(1, motion.base)));
    dockY.set(withDelay(motion.slow, lockTiming(0, motion.slow)));
    dockOpacity.set(withDelay(motion.slow, lockTiming(1, motion.slow)));

    const settle = setTimeout(land, INTRO_SETTLE);

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

  const swipeUp = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!reduceMotion && interactive)
        .activeOffsetY([-SWIPE_ACTIVATE, SWIPE_ACTIVATE])
        .failOffsetX([-SWIPE_ACTIVATE, SWIPE_ACTIVATE])
        .onEnd((event) => {
          if (event.translationY < -SWIPE_COMMIT) {
            scheduleOnRN(onOpenRegister);
          }
        }),
    [interactive, onOpenRegister, reduceMotion],
  );

  return (
    <GestureDetector gesture={swipeUp}>
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
            <SplashDockButton
              label={SPLASH_LOGIN_LABEL}
              labelColor={color.contentPrimary}
              fill={styles.invertedLogin}
              interactive={interactive}
              onPress={onOpenLogin}
            />
            <SplashDockButton
              label={SPLASH_REGISTER_LABEL}
              labelColor={color.contentInverse}
              fill={styles.tertiaryInverse}
              interactive={interactive}
              onPress={onOpenRegister}
            />
          </Animated.View>
        }
      />
    </GestureDetector>
  );
}

type SplashDockButtonProps = {
  label: string;
  labelColor: string;
  fill: StyleProp<ViewStyle>;
  interactive: boolean;
  onPress: () => void;
};

function SplashDockButton({
  label,
  labelColor,
  fill,
  interactive,
  onPress,
}: SplashDockButtonProps) {
  const typography = useTypography();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={!interactive}
      onPress={interactive ? onPress : undefined}
      style={({ pressed }) => [
        buttonLayoutStyles("fill"),
        fill,
        pressed && interactive && styles.pressed,
      ]}
    >
      <Text style={[typography.label, { color: labelColor }]}>{label}</Text>
    </Pressable>
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
