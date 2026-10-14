import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CollectionChip } from "@/collection/collection-chip";
import {
  COLLECTION_SORT_LABELS_DA,
  COLLECTION_SORTS,
  COLLECTION_VIEW_LABELS_DA,
  COLLECTION_VIEWS,
  type CollectionSort,
  type CollectionView,
} from "@/collection/collection-view-model";
import { Sheet } from "@/components/sheet";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type ViewSortSheetProps = {
  visible: boolean;
  view: CollectionView;
  sort: CollectionSort;
  /** Count of each view over the list the shortcut already narrowed. */
  viewCounts: Record<CollectionView, number>;
  onSelectView: (view: CollectionView) => void;
  onSelectSort: (sort: CollectionSort) => void;
  onDismiss: () => void;
};

/**
 * Vis og sortér (docs/design-system.md → Collection grid, Revision 2026-10-10): Sheet `form`.
 * A tap on a view or a sort applies it and closes the sheet.
 */
export function ViewSortSheet({
  visible,
  view,
  sort,
  viewCounts,
  onSelectView,
  onSelectSort,
  onDismiss,
}: ViewSortSheetProps) {
  const theme = useTheme();
  const typography = useTypography();

  return (
    <Sheet visible={visible} title="Vis og sortér" onDismiss={onDismiss} variant="form">
      <View style={styles.body}>
        <Text
          accessibilityRole="header"
          style={[typography.label, { color: theme.contentSecondary }]}
        >
          Vis
        </Text>
        <View accessibilityRole="radiogroup" style={styles.chips}>
          {COLLECTION_VIEWS.map((option) => (
            <CollectionChip
              key={option}
              label={COLLECTION_VIEW_LABELS_DA[option]}
              count={viewCounts[option]}
              selected={view === option}
              testID={`collection-view-option-${option}`}
              onPress={() => {
                onSelectView(option);
                onDismiss();
              }}
            />
          ))}
        </View>
        <Text
          accessibilityRole="header"
          style={[typography.label, styles.sortHeading, { color: theme.contentSecondary }]}
        >
          Sortér
        </Text>
        <View accessibilityRole="radiogroup">
          {COLLECTION_SORTS.map((option, index) => {
            const selected = sort === option;
            const last = index === COLLECTION_SORTS.length - 1;
            return (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={COLLECTION_SORT_LABELS_DA[option]}
                testID={`collection-sort-option-${option}`}
                onPress={() => {
                  onSelectSort(option);
                  onDismiss();
                }}
                style={({ pressed }) => [
                  styles.sortRow,
                  !last && { borderBottomColor: theme.borderSubtle },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[typography.label, { color: theme.contentPrimary }]}>
                  {COLLECTION_SORT_LABELS_DA[option]}
                </Text>
                {selected ? (
                  <Ionicons
                    name="checkmark"
                    size={22}
                    color={theme.fillPrimary}
                    accessibilityElementsHidden
                  />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: space.gapSm,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.gapSm,
  },
  sortHeading: {
    marginTop: space.insetMd,
  },
  sortRow: {
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "transparent",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pressed: {
    opacity: 0.9,
  },
});
