import { Ionicons } from "@expo/vector-icons";
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FadeScrim } from "@/components/fade-scrim";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space, withAlpha } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

const CONTROL_SIZE = 44;

type CaptureOverviewHeaderProps = {
  title: string;
  /** `mono` line under the title: photos · sorted. */
  caption: string;
  onClose: () => void;
  /** Reports the block's height so the list can start under it. */
  onMeasure: (height: number) => void;
};

/** Pinned overview title: Luk, the count as title, photos and state in `mono`, under the top fade. */
export function CaptureOverviewHeader({
  title,
  caption,
  onClose,
  onMeasure,
}: CaptureOverviewHeaderProps) {
  const theme = useTheme();
  const typography = useTypography();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root} pointerEvents="box-none">
      <View
        onLayout={(event: LayoutChangeEvent) => onMeasure(event.nativeEvent.layout.height)}
        style={[
          styles.block,
          { paddingTop: insets.top + space.insetSm, backgroundColor: theme.canvas },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Luk"
          testID="overview-close"
          onPress={onClose}
          style={({ pressed }) => [
            styles.close,
            { backgroundColor: withAlpha(theme.contentPrimary, 0.06) },
            pressed && styles.pressed,
          ]}
        >
          <Ionicons
            name="close"
            size={22}
            color={theme.contentPrimary}
            accessibilityElementsHidden
          />
        </Pressable>
        <View style={styles.copy}>
          <Text
            numberOfLines={1}
            accessibilityRole="header"
            testID="overview-title"
            style={[typography.title, { color: theme.contentPrimary }]}
          >
            {title}
          </Text>
          <Text
            numberOfLines={1}
            testID="overview-caption"
            style={[typography.mono, { color: theme.contentSecondary }]}
          >
            {caption}
          </Text>
        </View>
      </View>
      <FadeScrim edge="top" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  block: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapMd,
    paddingHorizontal: space.insetLg,
    paddingBottom: space.insetSm,
  },
  close: {
    width: CONTROL_SIZE,
    height: CONTROL_SIZE,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.85,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
});
