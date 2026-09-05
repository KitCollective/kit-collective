import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { motion, radius, space } from "@/theme/tokens";
import { useReduceMotion } from "@/theme/use-reduce-motion";
import { useTheme } from "@/theme/use-theme";

const DIAGRAM_SIZE = space.insetLg * 3;
const ICON_SIZE = space.insetLg + space.insetSm;
const FLOAT_DURATION = motion.slow * 2;
const LOCK_EASE = Easing.bezier(0.4, 0, 0.2, 1);

/**
 * Decorative shirt diagram for the collection empty state.
 * Same Ionicons family as the Tab bar — not an illustration library.
 */
export function CollectionEmptyDiagram() {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const floatY = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      floatY.set(0);
      return;
    }

    floatY.set(
      withRepeat(
        withTiming(-space.insetSm, {
          duration: FLOAT_DURATION,
          easing: LOCK_EASE,
        }),
        -1,
        true,
      ),
    );

    return () => {
      cancelAnimation(floatY);
    };
  }, [floatY, reduceMotion]);

  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: floatY.get() }],
  }));

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[styles.well, { backgroundColor: theme.fillSecondary }]}
    >
      <Animated.View style={floatStyle}>
        <Ionicons
          name="shirt-outline"
          size={ICON_SIZE}
          color={theme.contentPrimary}
          accessibilityElementsHidden
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  well: {
    width: DIAGRAM_SIZE,
    height: DIAGRAM_SIZE,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});
