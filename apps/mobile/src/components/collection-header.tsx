import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconButton } from "@/components/ui";
import { useTheme } from "@/theme/use-theme";
import { space, type } from "@/theme/tokens";

type CollectionHeaderProps = {
  count: number;
  onNotificationsPress: () => void;
};

export function CollectionHeader({ count, onNotificationsPress }: CollectionHeaderProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  return (
    <View style={[styles.container, { paddingTop: insets.top + space.insetSm }]}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: theme.contentPrimary }]}>Samling</Text>
        <Text style={[styles.count, { color: theme.contentMuted }]}>{count}</Text>
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
  title: {
    fontFamily: type.display.fontFamily,
    fontSize: type.display.fontSize,
    lineHeight: type.display.lineHeight,
    letterSpacing: type.display.letterSpacing,
  },
  count: {
    fontFamily: type.monoSm.fontFamily,
    fontSize: type.monoSm.fontSize,
    lineHeight: type.monoSm.lineHeight,
  },
});
