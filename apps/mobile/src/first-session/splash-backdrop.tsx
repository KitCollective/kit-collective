import { useEffect } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { color, motion, space, withAlpha } from "@/theme/tokens";
import { useReduceMotion } from "@/theme/use-reduce-motion";

// SAFETY: Metro static asset; the PNG is committed under apps/mobile/assets/brand.
const jerseyPhoto = require("../../assets/brand/splash-prize-jersey.png");

const LOCK_EASE = Easing.bezier(0.4, 0, 0.2, 1);
const DRIFT_DURATION = motion.slow * 22;
const SHEEN_DURATION = motion.slow * 18;
const DRIFT_SCALE = 0.04;
const SHEEN_EDGE_ALPHA = 0.02;
const SHEEN_MID_ALPHA = 0.045;
const SHEEN_ALPHA = 0.07;
const CENTRE_SCRIM_ALPHA = 0.32;

type SplashBackdropProps = {
  /** Slow studio drift + floodlight. Off while boot is still settling. */
  alive?: boolean;
};

/**
 * Prize-jersey still with a quiet studio atmosphere.
 * Reduced-motion keeps the photo and scrim, without transform travel.
 */
export function SplashBackdrop({ alive = true }: SplashBackdropProps) {
  const reduceMotion = useReduceMotion();
  const { height, width } = useWindowDimensions();
  const drift = useSharedValue(0);
  const sheenY = useSharedValue(-height);
  const motionOn = alive && !reduceMotion;
  const sheenHeight = space.insetLg * 8;

  useEffect(() => {
    if (!motionOn) {
      drift.set(0);
      sheenY.set(-height);
      return;
    }

    drift.set(0);
    drift.set(
      withRepeat(
        withTiming(1, {
          duration: DRIFT_DURATION,
          easing: LOCK_EASE,
        }),
        -1,
        true,
      ),
    );
    sheenY.set(-sheenHeight);
    sheenY.set(
      withRepeat(
        withTiming(height, {
          duration: SHEEN_DURATION,
          easing: LOCK_EASE,
        }),
        -1,
        true,
      ),
    );

    return () => {
      cancelAnimation(drift);
      cancelAnimation(sheenY);
    };
  }, [drift, height, motionOn, sheenHeight, sheenY]);

  const photoStyle = useAnimatedStyle(() => {
    const amount = drift.get();
    return {
      transform: [{ translateY: amount * -space.insetMd }, { scale: 1 + amount * DRIFT_SCALE }],
    };
  });
  const sheenStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheenY.get() }],
  }));

  const frame = { width, height };

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.root, { width, height }]}
    >
      <Animated.Image source={jerseyPhoto} resizeMode="cover" style={[frame, photoStyle]} />
      {motionOn ? (
        <Animated.View style={[styles.sheen, { width, height: sheenHeight }, sheenStyle]}>
          <View
            style={[
              styles.sheenBand,
              { backgroundColor: withAlpha(color.contentInverse, SHEEN_EDGE_ALPHA) },
            ]}
          />
          <View
            style={[
              styles.sheenBand,
              { backgroundColor: withAlpha(color.contentInverse, SHEEN_MID_ALPHA) },
            ]}
          />
          <View
            style={[
              styles.sheenBand,
              { backgroundColor: withAlpha(color.contentInverse, SHEEN_ALPHA) },
            ]}
          />
          <View
            style={[
              styles.sheenBand,
              { backgroundColor: withAlpha(color.contentInverse, SHEEN_MID_ALPHA) },
            ]}
          />
          <View
            style={[
              styles.sheenBand,
              { backgroundColor: withAlpha(color.contentInverse, SHEEN_EDGE_ALPHA) },
            ]}
          />
        </Animated.View>
      ) : null}
      <View style={[styles.layer, { backgroundColor: color.scrim }]} />
      <View
        style={[
          styles.layer,
          { backgroundColor: withAlpha(color.fillPrimary, CENTRE_SCRIM_ALPHA) },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    overflow: "hidden",
  },
  layer: {
    ...StyleSheet.absoluteFill,
  },
  sheen: {
    position: "absolute",
    left: 0,
    top: 0,
  },
  sheenBand: {
    flex: 1,
  },
});
