import { Ionicons } from "@expo/vector-icons";
import type { CollectionShortcut } from "@kit/api-contract";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CollectionChip } from "@/collection/collection-chip";
import { COLLECTION_VIEW_LABELS_DA, type CollectionView } from "@/collection/collection-view-model";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type ShortcutChipRowProps = {
  shortcuts: CollectionShortcut[];
  selectedShortcutId: string | null;
  onSelectAlle: () => void;
  onSelectShortcut: (shortcutId: string) => void;
  onTilpasPress: () => void;
  /** The active Vis. "all" shows the icon-only control. */
  view: CollectionView;
  /** Count of the active view over the shortcut's result. */
  viewCount: number;
  onViewControlPress: () => void;
  onClearView: () => void;
};

export function ShortcutChipRow({
  shortcuts,
  selectedShortcutId,
  onSelectAlle,
  onSelectShortcut,
  onTilpasPress,
  view,
  viewCount,
  onViewControlPress,
  onClearView,
}: ShortcutChipRowProps) {
  const theme = useTheme();
  const typography = useTypography();
  const viewActive = view !== "all";
  const viewName = COLLECTION_VIEW_LABELS_DA[view];

  return (
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.row, { paddingBottom: space.insetSm }]}
      >
        {viewActive ? (
          <View style={[styles.activeView, { backgroundColor: theme.fillPrimary }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Vis og sortér, ${viewName}, ${viewCount}`}
              testID="collection-view-control"
              onPress={onViewControlPress}
              style={({ pressed }) => [styles.activeViewLabel, pressed && styles.pressed]}
            >
              <Text style={[typography.labelSm, { color: theme.contentInverse }]}>{viewName}</Text>
              <Text style={[typography.monoSm, { color: theme.contentInverse }]}>{viewCount}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Ryd visning ${viewName}`}
              testID="collection-view-clear"
              onPress={onClearView}
              style={({ pressed }) => [styles.clear, pressed && styles.pressed]}
            >
              <Ionicons
                name="close"
                size={18}
                color={theme.contentInverse}
                accessibilityElementsHidden
              />
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Vis og sortér"
            testID="collection-view-control"
            onPress={onViewControlPress}
            style={({ pressed }) => [
              styles.iconChip,
              { backgroundColor: theme.fillSecondary },
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name="options-outline"
              size={20}
              color={theme.contentPrimary}
              accessibilityElementsHidden
            />
          </Pressable>
        )}
        <CollectionChip
          label="Alle"
          testID="shortcut-chip-all"
          selected={selectedShortcutId === null}
          onPress={onSelectAlle}
        />
        {shortcuts.map((shortcut) => (
          <CollectionChip
            key={shortcut.id}
            label={shortcut.name}
            testID={`shortcut-chip-${shortcut.id}`}
            selected={selectedShortcutId === shortcut.id}
            onPress={() => onSelectShortcut(shortcut.id)}
          />
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tilpas genveje"
          onPress={onTilpasPress}
          style={({ pressed }) => [styles.tilpas, pressed && styles.pressed]}
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
  iconChip: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  activeView: {
    minHeight: 44,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
  },
  activeViewLabel: {
    minHeight: 44,
    paddingLeft: space.insetMd,
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapSm,
  },
  clear: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  tilpas: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.insetSm,
  },
  pressed: {
    opacity: 0.8,
  },
});
