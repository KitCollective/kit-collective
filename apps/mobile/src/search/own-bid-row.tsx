import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ownBidRowCopy } from "@/search/bid-rules";
import { useBrandFontsEnabled, useTypography } from "@/theme/brand-fonts";
import { fontFamily, radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

const ROW_HEIGHT = 54;

type OwnBidRowProps = {
  amountDkk: number;
  onPress: () => void;
};

/**
 * The dock row that replaces Send bud while this Collector's bid waits (docs/design-system.md →
 * Foreign UserJersey detail → Button dock): `fill.secondary`, `radius.md`, 54 high, **Dit bud** and
 * the amount in `mono`, **Afventer svar** in `mono` `content.secondary`, a trailing chevron. It
 * opens the thread for that Bud.
 */
export function OwnBidRow({ amountDkk, onPress }: OwnBidRowProps) {
  const theme = useTheme();
  const typography = useTypography();
  const brandFontsEnabled = useBrandFontsEnabled();
  const copy = ownBidRowCopy(amountDkk);

  return (
    <Pressable
      testID="own-bid-row"
      accessibilityRole="button"
      accessibilityLabel={copy.accessibilityLabel}
      accessibilityHint="Åbner samtalen om buddet"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.fillSecondary },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.text}>
        <Text style={[typography.label, { color: theme.contentPrimary }]} numberOfLines={1}>
          {copy.title}
        </Text>
        <Text style={[typography.mono, { color: theme.contentSecondary }]} numberOfLines={1}>
          {copy.status}
        </Text>
      </View>
      <Text
        style={[
          typography.mono,
          {
            color: theme.contentPrimary,
            fontFamily: brandFontsEnabled ? fontFamily.monoMedium : typography.mono.fontFamily,
          },
        ]}
      >
        {copy.amount}
      </Text>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={theme.contentMuted}
        accessibilityElementsHidden
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    height: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapMd,
    borderRadius: radius.md,
    paddingHorizontal: space.insetMd,
  },
  pressed: {
    opacity: 0.6,
  },
  text: {
    flex: 1,
  },
});
