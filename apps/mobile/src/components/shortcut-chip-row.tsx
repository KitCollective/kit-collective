import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Chip } from "@/components/chip";
import { space } from "@/theme/tokens";

type ShortcutChipRowProps = {
  selectedShortcutId: string | null;
  onSelectAlle: () => void;
};

export function ShortcutChipRow({ selectedShortcutId, onSelectAlle }: ShortcutChipRowProps) {
  return (
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.row, { paddingBottom: space.insetSm }]}
      >
        <Chip
          label="Alle"
          selected={selectedShortcutId === null}
          onPress={onSelectAlle}
          accessibilityRole="radio"
        />
      </ScrollView>
    </View>
  );
}

export function useTabBarContentPadding(): number {
  const insets = useSafeAreaInsets();
  // Inline spacing scale (docs/design-system.md Layout — no named pixel-reserve export).
  return (
    space.insetLg * 2 +
    space.insetMd +
    space.insetLg +
    space.insetSm +
    insets.bottom +
    space.insetMd
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: space.insetMd,
  },
  row: {
    flexDirection: "row",
    gap: space.gapSm,
    alignItems: "center",
  },
});
