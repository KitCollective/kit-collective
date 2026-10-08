import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FADE_SCRIM_HEIGHT, FadeScrim } from "@/components/fade-scrim";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space, withAlpha } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

const HEADER_CONTROL_SIZE = 44;

export function confirmHubHeaderScrollPadding(topInset: number): number {
  return topInset + space.insetSm + HEADER_CONTROL_SIZE + space.insetSm + FADE_SCRIM_HEIGHT;
}

type ConfirmHubHeaderProps = {
  /** Dismisses the whole capture modal back to Samling. */
  onClose: () => void;
};

/**
 * Pinned Confirm hub title with the inverted fade/blur used on the Button dock.
 * A top-left circular Luk (X) chrome button dismisses the capture modal to Samling.
 */
export function ConfirmHubHeader({ onClose }: ConfirmHubHeaderProps) {
  const theme = useTheme();
  const typography = useTypography();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root} pointerEvents="box-none">
      <View
        style={[
          styles.titleBlock,
          {
            paddingTop: insets.top + space.insetSm,
            backgroundColor: theme.canvas,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Luk"
          onPress={onClose}
          style={({ pressed }) => [
            styles.chromeButton,
            { backgroundColor: withAlpha(theme.contentPrimary, 0.06) },
            pressed && styles.chromePressed,
          ]}
        >
          <Ionicons
            name="close"
            size={22}
            color={theme.contentPrimary}
            accessibilityElementsHidden
          />
        </Pressable>
        <Text
          numberOfLines={1}
          style={[typography.title, styles.title, { color: theme.contentPrimary }]}
        >
          Bekræft
        </Text>
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
  titleBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapMd,
    paddingHorizontal: space.insetLg,
    paddingBottom: space.insetSm,
  },
  chromeButton: {
    width: HEADER_CONTROL_SIZE,
    height: HEADER_CONTROL_SIZE,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  chromePressed: {
    opacity: 0.85,
  },
  title: {
    flex: 1,
    minWidth: 0,
  },
});
