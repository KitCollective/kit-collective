import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import {
  CONFIRM_VISION_BANNER_COPY,
  type ConfirmVisionBannerState,
} from "@/capture/confirmVisionBanner";
import { useTypography } from "@/theme/brand-fonts";
import type { ThemeColors } from "@/theme/tokens";
import { radius, space, withAlpha } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type ConfirmVisionBannerProps = {
  state: ConfirmVisionBannerState;
};

type VisionBannerToneStyle = {
  background: string;
  border: string;
  icon: string;
};

/**
 * Vision analyzer chrome, composed from the Banner tokens (`border 1`, `radius.md`,
 * `space.inset.md`) plus a static AI icon on the left and a spinner on the right while
 * analysing. Success uses the sanctioned Banner `success` tone (green) — this is the
 * Banner primitive's own tone, distinct from the donut "never success green" rule.
 *
 * Design-lock gaps flagged in `docs/design-system.md` (Modes 2026-09-06): the Banner
 * primitive locks a plain `fill.secondary` background with no leading icon / trailing
 * accessory, and has no neutral tone. The `analyzing` light-blue tint is composed from
 * the existing `info` token via `withAlpha` (no invented hex) and `inactive` uses the
 * neutral `border.subtle`.
 */
function getVisionBannerToneStyle(
  theme: ThemeColors,
  state: ConfirmVisionBannerState,
): VisionBannerToneStyle {
  switch (state) {
    case "inactive":
      // Neutral / quiet — the analyzer is off, not an error or a warning.
      return {
        background: theme.fillSecondary,
        border: theme.borderSubtle,
        icon: theme.contentMuted,
      };
    case "out-of-quota":
      // Freemium limit reached — a soft block, not a failure.
      return { background: theme.fillSecondary, border: theme.warning, icon: theme.warning };
    case "analyzing":
      // Light-blue tint composed from the `info` token (no invented hex).
      return { background: withAlpha(theme.info, 0.08), border: theme.info, icon: theme.info };
    case "success":
      // Sanctioned Banner green (tone: success) — not the donut stroke.
      return { background: theme.fillSecondary, border: theme.success, icon: theme.success };
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

export function ConfirmVisionBanner({ state }: ConfirmVisionBannerProps) {
  const theme = useTheme();
  const typography = useTypography();
  const tone = getVisionBannerToneStyle(theme, state);
  const message = CONFIRM_VISION_BANNER_COPY[state];
  const isAnalyzing = state === "analyzing";

  return (
    <View
      accessible
      accessibilityRole={isAnalyzing ? "progressbar" : "text"}
      accessibilityLabel={message}
      accessibilityState={isAnalyzing ? { busy: true } : undefined}
      style={[styles.banner, { backgroundColor: tone.background, borderColor: tone.border }]}
    >
      <Ionicons
        name="sparkles"
        size={20}
        color={tone.icon}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <View style={styles.body}>
        <Text style={[typography.body, { color: theme.contentPrimary }]}>{message}</Text>
        {isAnalyzing ? (
          <View style={styles.skeleton}>
            <View style={[styles.skeletonBar, { backgroundColor: withAlpha(theme.info, 0.16) }]} />
            <View
              style={[styles.skeletonBarShort, { backgroundColor: withAlpha(theme.info, 0.16) }]}
            />
          </View>
        ) : null}
      </View>
      {isAnalyzing ? <ActivityIndicator size="small" color={theme.info} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapSm,
    borderWidth: 1,
    borderRadius: radius.md,
    // Shorter than the Banner default inset.md so the strip sits lighter above the
    // Data/Detaljer cards while staying comfortably legible.
    padding: space.insetSm,
  },
  body: {
    flex: 1,
    gap: space.gapSm,
  },
  skeleton: {
    gap: space.gapSm,
  },
  skeletonBar: {
    height: 8,
    width: "70%",
    borderRadius: radius.sm,
  },
  skeletonBarShort: {
    height: 8,
    width: "45%",
    borderRadius: radius.sm,
  },
});
