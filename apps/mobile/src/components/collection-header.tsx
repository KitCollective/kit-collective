import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconButton } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type CollectionHeaderProps = {
  count: number;
  onNotificationsPress: () => void;
};

export function CollectionHeader({ count, onNotificationsPress }: CollectionHeaderProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const typography = useTypography();

  return (
    <View style={[styles.container, { paddingTop: insets.top + space.insetSm }]}>
      <View style={styles.titleRow}>
        <Text style={[typography.display, { color: theme.contentPrimary }]}>Samling</Text>
        <Text style={[typography.monoSm, { color: theme.contentMuted }]}>{count}</Text>
      </View>
      <IconButton
        name="Notifikationer"
        icon="notifications-outline"
        onPress={onNotificationsPress}
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
