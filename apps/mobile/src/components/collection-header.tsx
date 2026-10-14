import { StyleSheet, Text, View } from "react-native";
import { IconButton } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useStableSafeAreaInsets } from "@/theme/use-stable-safe-area-insets";
import { useTheme } from "@/theme/use-theme";

type CollectionHeaderProps = {
  /** Not drawn (the facts block replaces the small count). Only the screen reader hears it. */
  count?: number;
  onAddPress: () => void;
};

const CAPTURE_DISC = 44;

export function CollectionHeader({ count, onAddPress }: CollectionHeaderProps) {
  const insets = useStableSafeAreaInsets();
  const theme = useTheme();
  const typography = useTypography();

  return (
    <View style={[styles.container, { paddingTop: insets.top + space.insetSm }]}>
      <Text
        accessibilityRole="header"
        accessibilityLabel={count ? `Samling, ${count} trøjer` : "Samling"}
        style={[typography.displayLarge, { color: theme.contentPrimary }]}
      >
        Samling
      </Text>
      <IconButton
        name="Tilføj trøje"
        testID="collection-add"
        icon="add"
        onPress={onAddPress}
        iconColor={theme.contentInverse}
        style={({ pressed }) => [
          styles.captureDisc,
          { backgroundColor: theme.fillPrimary },
          pressed && styles.capturePressed,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.insetMd,
    paddingBottom: space.insetSm,
    minHeight: 52,
  },
  captureDisc: {
    width: CAPTURE_DISC,
    height: CAPTURE_DISC,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  capturePressed: {
    opacity: 0.9,
  },
});
