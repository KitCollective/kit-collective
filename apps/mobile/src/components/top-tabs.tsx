import { useEffect, useState } from "react";
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useTypography } from "@/theme/brand-fonts";
import { motion, space } from "@/theme/tokens";
import { useReduceMotion } from "@/theme/use-reduce-motion";
import { useTheme } from "@/theme/use-theme";

type TabLayout = { x: number; width: number };

type TopTabsProps<T extends string> = {
  items: readonly [T, T];
  active: T;
  onChange: (value: T) => void;
  /** 0 = first tab, 1 = second. When set, the underline follows this value. */
  progress?: number;
};

const LOCK_EASE = Easing.bezier(0.4, 0, 0.2, 1);

export function TopTabs<T extends string>({ items, active, onChange, progress }: TopTabsProps<T>) {
  const theme = useTheme();
  const typography = useTypography();
  const reduceMotion = useReduceMotion();
  const [layouts, setLayouts] = useState<Partial<Record<T, TabLayout>>>({});
  const underlineX = useSharedValue(0);
  const underlineWidth = useSharedValue(0);

  const recordLayout = (item: T) => (event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    setLayouts((current) => {
      const previous = current[item];
      if (previous && previous.x === x && previous.width === width) {
        return current;
      }
      return { ...current, [item]: { x, width } };
    });
  };

  useEffect(() => {
    const first = layouts[items[0]];
    const second = layouts[items[1]];
    if (!first || !second) {
      return;
    }

    const t = progress ?? (active === items[1] ? 1 : 0);
    const firstX = first.x + space.insetSm;
    const secondX = second.x + space.insetSm;
    const firstWidth = Math.max(0, first.width - space.insetSm * 2);
    const secondWidth = Math.max(0, second.width - space.insetSm * 2);
    const nextX = firstX + (secondX - firstX) * t;
    const nextWidth = firstWidth + (secondWidth - firstWidth) * t;
    const duration = reduceMotion || progress != null ? 0 : motion.fast;

    underlineX.set(withTiming(nextX, { duration, easing: LOCK_EASE }));
    underlineWidth.set(withTiming(nextWidth, { duration, easing: LOCK_EASE }));
  }, [active, items, layouts, progress, reduceMotion, underlineWidth, underlineX]);

  const underlineStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: underlineX.get() }],
    width: underlineWidth.get(),
  }));

  return (
    <View
      style={[styles.container, { borderBottomColor: theme.borderSubtle }]}
      accessibilityRole="tablist"
    >
      {items.map((item) => {
        const isActive = item === active;

        return (
          <Pressable
            key={item}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            onPress={() => onChange(item)}
            onLayout={recordLayout(item)}
            style={styles.tab}
          >
            <Text
              style={[
                typography.body,
                { color: isActive ? theme.contentPrimary : theme.contentSecondary },
              ]}
            >
              {item}
            </Text>
          </Pressable>
        );
      })}
      <Animated.View
        pointerEvents="none"
        style={[styles.underline, { backgroundColor: theme.fillPrimary }, underlineStyle]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    borderBottomWidth: 1,
    paddingHorizontal: space.insetMd,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    paddingVertical: space.insetSm,
  },
  underline: {
    position: "absolute",
    left: 0,
    bottom: 0,
    height: 2,
  },
});
