import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

/**
 * Lightweight transition surface for the Upload billeder branch of the capture
 * Chooser (docs/design-system.md → Patterns → Capture session). It covers the two
 * windows that used to flash a blank Samling: the gap after the Chooser Sheet's Modal
 * dismisses while the system picker opens, and the window after a pick while the
 * capture session is built. Canvas + a centred spinner + one Danish caption composed
 * from locked tokens — not the branded splash plate and not the Vision "analysing"
 * screen (Save never waits on it; it just replaces itself with Confirm).
 */
export function CaptureLoadingScreen({ caption }: { caption: string }) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <View
      style={[styles.screen, { backgroundColor: theme.canvas }]}
      accessibilityRole="progressbar"
      accessibilityLabel={caption}
    >
      <ActivityIndicator color={theme.contentPrimary} />
      <Text style={[typography.body, { color: theme.contentSecondary }]}>{caption}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.gapMd,
    padding: space.insetLg,
  },
});
