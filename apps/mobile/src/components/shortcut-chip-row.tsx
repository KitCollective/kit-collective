import type { CollectionShortcut } from "@kit/api-contract";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Chip } from "@/components/chip";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type ShortcutChipRowProps = {
  shortcuts: CollectionShortcut[];
  selectedShortcutId: string | null;
  onSelectAlle: () => void;
  onSelectShortcut: (shortcutId: string) => void;
  onTilpasPress: () => void;
};

export function ShortcutChipRow({
  shortcuts,
  selectedShortcutId,
  onSelectAlle,
  onSelectShortcut,
  onTilpasPress,
}: ShortcutChipRowProps) {
  const theme = useTheme();
  const typography = useTypography();

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
        {shortcuts.map((shortcut) => (
          <Chip
            key={shortcut.id}
            label={shortcut.name}
            selected={selectedShortcutId === shortcut.id}
            onPress={() => onSelectShortcut(shortcut.id)}
            accessibilityRole="radio"
          />
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tilpas genveje"
          onPress={onTilpasPress}
          style={({ pressed }) => [styles.tilpas, pressed && styles.tilpasPressed]}
        >
          <Text style={[typography.labelSm, { color: theme.contentPrimary }]}>Tilpas</Text>
        </Pressable>
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
  tilpas: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.insetSm,
  },
  tilpasPressed: {
    opacity: 0.8,
  },
});
