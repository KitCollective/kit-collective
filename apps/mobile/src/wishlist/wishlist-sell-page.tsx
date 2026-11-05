import { StyleSheet, Text, View } from "react-native";
import { ScreenHeader } from "@/components/screen-header";
import { Button } from "@/components/ui";
import type { SellPage } from "@/premium/plus-view-model";
import { PriceSkeleton } from "@/premium/price-skeleton";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space, type, withAlpha } from "@/theme/tokens";
import { useStableSafeAreaInsets } from "@/theme/use-stable-safe-area-insets";
import { useTheme } from "@/theme/use-theme";

const THUMB_WIDTH = 84;
const THUMB_HEIGHT = 105;

type WishlistSellPageProps = {
  sell: SellPage;
  onPressPlus: () => void;
};

/**
 * Ønsker for a Collector without Plus: it says what the feature does, shows one example Wish row
 * and one button. Nothing opens or starts by itself (docs/design-system.md → Ønsker, Without Plus).
 */
export function WishlistSellPage({ sell, onPressPlus }: WishlistSellPageProps) {
  const theme = useTheme();
  const typography = useTypography();
  const insets = useStableSafeAreaInsets();

  return (
    <View style={[styles.screen, { backgroundColor: theme.canvas }]} testID="wishlist-sell-page">
      <ScreenHeader title="Ønsker" />
      <View style={styles.pitch}>
        <Text style={[typography.title, { color: theme.contentPrimary }]}>
          Få besked, når trøjen dukker op
        </Text>
        <Text style={[typography.body, { color: theme.contentSecondary }]}>
          Vi siger til, når en samler åbner den for bud.
        </Text>
        <View
          style={[styles.example, { backgroundColor: theme.fillSecondary }]}
          accessible
          accessibilityLabel="Eksempel på et ønske, 2 nye"
          testID="wishlist-example-row"
        >
          <View style={styles.exampleHead}>
            <Text style={[typography.caption, { color: theme.contentMuted }]}>Eksempel</Text>
            <View style={[styles.pill, { backgroundColor: theme.fillPrimary }]}>
              <Text style={[typography.captionSm, { color: theme.contentInverse }]}>2 nye</Text>
            </View>
          </View>
          <View style={styles.thumbs}>
            <View
              style={[styles.thumb, { backgroundColor: withAlpha(theme.contentPrimary, 0.08) }]}
            />
            <View
              style={[styles.thumb, { backgroundColor: withAlpha(theme.contentPrimary, 0.08) }]}
            />
          </View>
        </View>
      </View>
      <View style={[styles.dock, { paddingBottom: insets.bottom + space.insetMd }]}>
        <Button
          label={sell.buttonLabel}
          testID="wishlist-plus-cta"
          variant="primary"
          width="fill"
          onPress={onPressPlus}
        />
        <View style={styles.caption}>
          {sell.caption ? (
            <Text style={[typography.caption, { color: theme.contentSecondary }]}>
              {sell.caption}
            </Text>
          ) : (
            <PriceSkeleton width={space.insetLg * 4} height={type.caption.lineHeight} />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  pitch: {
    flex: 1,
    paddingHorizontal: space.insetMd,
    gap: space.gapMd,
  },
  example: {
    borderRadius: radius.md,
    padding: space.insetMd,
    gap: space.gapMd,
  },
  exampleHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pill: {
    borderRadius: radius.pill,
    paddingHorizontal: space.insetSm,
    paddingVertical: space.gapSm / 4,
  },
  thumbs: {
    flexDirection: "row",
    gap: space.gapSm,
  },
  thumb: {
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
    borderRadius: radius.sm,
  },
  dock: {
    paddingHorizontal: space.insetMd,
    gap: space.gapSm,
  },
  caption: {
    alignItems: "center",
    minHeight: type.caption.lineHeight,
  },
});
