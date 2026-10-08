import { BlurView } from "expo-blur";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { space } from "@/theme/tokens";
import { useReduceMotion } from "@/theme/use-reduce-motion";
import { useTheme } from "@/theme/use-theme";

/** Shared height for Confirm hub header fade and Button dock fade. */
export const FADE_SCRIM_HEIGHT = space.insetMd;

type FadeScrimEdge = "top" | "bottom";

type FadeScrimProps = {
  /** `top`: opaque canvas at the top, dissolving downward. `bottom`: dissolving upward into the dock. */
  edge: FadeScrimEdge;
  height?: number;
};

/**
 * Soft blur + continuous canvas gradient so scrolling content dissolves
 * under a pinned chrome edge (docs/design-system.md → Button dock `fade`).
 */
export function FadeScrim({ edge, height = FADE_SCRIM_HEIGHT }: FadeScrimProps) {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const gradientId = `fade-scrim-${edge}`;
  const startOpacity = edge === "bottom" ? 0 : 1;
  const midOpacity = edge === "bottom" ? 0.2 : 0.25;
  const endOpacity = edge === "bottom" ? 1 : 0;

  return (
    <View style={[styles.root, { height }]} pointerEvents="none">
      {!reduceMotion ? (
        <BlurView intensity={24} tint="default" style={StyleSheet.absoluteFill} />
      ) : null}
      <Svg
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      >
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={theme.canvas} stopOpacity={startOpacity} />
            <Stop offset="0.35" stopColor={theme.canvas} stopOpacity={midOpacity} />
            <Stop offset="1" stopColor={theme.canvas} stopOpacity={endOpacity} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradientId})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
    overflow: "hidden",
  },
});
