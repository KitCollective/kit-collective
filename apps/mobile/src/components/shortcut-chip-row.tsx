import { ScrollView, StyleSheet, View } from "react-native";
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
