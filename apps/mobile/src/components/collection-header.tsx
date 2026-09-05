import { StyleSheet, Text, View } from "react-native";
import { IconButton } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useStableSafeAreaInsets } from "@/theme/use-stable-safe-area-insets";
import { useTheme } from "@/theme/use-theme";

type CollectionHeaderProps = {
  count: number;
  onAddPress: () => void;
};

export function CollectionHeader({ count, onAddPress }: CollectionHeaderProps) {
  const insets = useStableSafeAreaInsets();
  const theme = useTheme();
  const typography = useTypography();

  return (
    <View style={[styles.container, { paddingTop: insets.top + space.insetSm }]}>
      <View style={styles.titleRow}>
        <Text style={[typography.display, { color: theme.contentPrimary }]}>Samling</Text>
        <Text style={[typography.monoSm, { color: theme.contentMuted }]}>{count}</Text>
      </View>
      <IconButton
        name="Tilføj trøje"
        icon="add"
        onPress={onAddPress}
        iconColor={theme.contentPrimary}
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
  titleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: space.gapSm,
  },
});
