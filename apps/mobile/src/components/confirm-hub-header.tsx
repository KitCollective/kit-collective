import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FADE_SCRIM_HEIGHT, FadeScrim } from "@/components/fade-scrim";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space, withAlpha } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

const HEADER_CONTROL_SIZE = 44;

/** The jersey index's count badge hangs this far above the circles, growing the header row. */
const INDEX_BADGE_OUTSET = space.insetSm;

export function confirmHubHeaderScrollPadding(
  topInset: number,
  options?: { withIndex?: boolean },
): number {
  const indexExtra = options?.withIndex ? INDEX_BADGE_OUTSET : 0;
  return (
    topInset + space.insetSm + HEADER_CONTROL_SIZE + indexExtra + space.insetSm + FADE_SCRIM_HEIGHT
  );
}

type ConfirmHubHeaderProps = {
  /** Dismisses the whole capture modal back to Samling. */
  onClose: () => void;
  /** With one jersey the index (circle 1 + add) trails the title here. */
  trailing?: ReactNode;
};

/**
 * Pinned Confirm hub title with the inverted fade/blur used on the Button dock.
 * A top-left circular Luk (X) chrome button dismisses the capture modal to Samling.
 */
export function ConfirmHubHeader({ onClose, trailing }: ConfirmHubHeaderProps) {
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
          testID="confirm-close"
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
        {trailing}
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
