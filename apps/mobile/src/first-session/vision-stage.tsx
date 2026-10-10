import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useTypography } from "@/theme/brand-fonts";
import { color, radius, space, withAlpha } from "@/theme/tokens";

/**
 * The 4:5 Vision stage pieces shared by the try-it demo and the own-photo
 * analysing screen: the stage rect, the scan line and ring, and the rows that
 * resolve one at a time (docs/design-system.md -> Motion -> Brand moments).
 */
export const STAGE_WIDTH_RATIO = 0.56;
export const STAGE_RATIO = 5 / 4;
export const MUTED_ALPHA = 0.64;
export const LOCK_EASE = Easing.bezier(0.4, 0, 0.2, 1);

const SKELETON_ALPHA = 0.16;
const SCAN_LINE_HEIGHT = 2;

export type StageRect = { x: number; y: number; width: number; height: number };

export function stageRectFor(windowWidth: number, top: number): StageRect {
  const width = Math.round(windowWidth * STAGE_WIDTH_RATIO);
  return { x: (windowWidth - width) / 2, y: top, width, height: width * STAGE_RATIO };
}

type StageOverlaysProps = {
  /** False under Reduce Motion: the scan line and ring are omitted. */
  showsScanLine: boolean;
  scanStyle: object;
  ringStyle: object;
};

/** Scan line and the one ring pulse, drawn over the stage photo. */
export function StageOverlays({ showsScanLine, scanStyle, ringStyle }: StageOverlaysProps) {
  if (!showsScanLine) {
    return null;
  }
  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.scanLine,
          { backgroundColor: withAlpha(color.contentInverse, 0.8) },
          scanStyle,
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.ring, { borderColor: color.contentInverse }, ringStyle]}
      />
    </>
  );
}

type VisionRowProps = {
  label: string;
  /** Undefined while Vision has not found this row; the skeleton stays. */
  value: string | undefined;
  revealed: boolean;
  revealMs: number;
  mutedColor: string;
};

export function VisionRow({ label, value, revealed, revealMs, mutedColor }: VisionRowProps) {
  const typography = useTypography();
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.set(withTiming(revealed ? 1 : 0, { duration: revealMs, easing: LOCK_EASE }));
  }, [opacity, revealMs, revealed]);

  const valueStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  const skeletonStyle = useAnimatedStyle(() => ({ opacity: 1 - opacity.get() }));

  return (
    <View style={styles.row}>
      <Text
        accessibilityElementsHidden={!revealed}
        importantForAccessibility={revealed ? "auto" : "no-hide-descendants"}
        style={[typography.mono, { color: mutedColor }]}
      >
        {label}
      </Text>
      <View
        style={styles.rowValue}
        accessibilityElementsHidden={!revealed}
        importantForAccessibility={revealed ? "auto" : "no-hide-descendants"}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.skeleton,
            { backgroundColor: withAlpha(color.contentInverse, SKELETON_ALPHA) },
            skeletonStyle,
          ]}
        />
        <Animated.Text style={[typography.title, { color: color.contentInverse }, valueStyle]}>
          {value ?? ""}
        </Animated.Text>
      </View>
    </View>
  );
}

export const visionStageStyles = StyleSheet.create({
  stage: {
    position: "absolute",
    borderRadius: radius.md,
    overflow: "visible",
  },
  stageImage: {
    width: "100%",
    height: "100%",
    borderRadius: radius.md,
  },
  rows: {
    position: "absolute",
    left: space.insetLg,
    right: space.insetLg,
    gap: space.gapMd,
  },
});

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
  row: {
    gap: space.gapSm / 2,
  },
  rowValue: {
    minHeight: 29,
    justifyContent: "center",
  },
  skeleton: {
    position: "absolute",
    left: 0,
    width: "40%",
    height: 16,
    borderRadius: radius.sm,
  },
});
