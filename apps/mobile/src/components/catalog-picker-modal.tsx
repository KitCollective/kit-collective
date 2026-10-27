import { Fragment, type ReactNode } from "react";
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { CatalogPickerRow } from "@/catalog/catalogPickerRow";
import { Banner, ListRow, SearchField } from "@/components/catalog-ui";
import { IconButton } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useReduceMotion } from "@/theme/use-reduce-motion";
import { useTheme } from "@/theme/use-theme";

type CatalogPickerModalProps = {
  visible: boolean;
  title: string;
  searchPlaceholder: string;
  query: string;
  onQueryChange: (query: string) => void;
  items: CatalogPickerRow[];
  selectedId: string | null;
  loading?: boolean;
  errorMessage?: string | null;
  noticeMessage?: string | null;
  emptyMessage?: string;
  searchable?: boolean;
  onSelect: (item: CatalogPickerRow) => void;
  onDismiss: () => void;
  /**
   * Replaces the default List row, e.g. to lead with a Number emblem. The picker still owns the
   * selection: call `onPress` to select the row.
   */
  renderRow?: (
    item: CatalogPickerRow,
    row: { selected: boolean; onPress: () => void },
  ) => ReactNode;
  /** Sits above the rows, under the search, e.g. a way to remove the current choice. */
  listHeader?: ReactNode;
  /** iOS: fires once the Modal has left the screen, so the next surface can be presented. */
  onModalHide?: () => void;
};

/**
 * Full-screen catalog picker used for club, season, and player.
 * Luk (X) sits top-left with the title beside it — not a Sheet.
 */
export function CatalogPickerModal({
  visible,
  title,
  searchPlaceholder,
  query,
  onQueryChange,
  items,
  selectedId,
  loading = false,
  errorMessage = null,
  noticeMessage = null,
  emptyMessage = "Ingen resultater.",
  searchable = true,
  onSelect,
  onDismiss,
  renderRow,
  listHeader,
  onModalHide,
}: CatalogPickerModalProps) {
  const theme = useTheme();
  const typography = useTypography();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();

  return (
    <Modal
      animationType={reduceMotion ? "none" : "slide"}
      visible={visible}
      presentationStyle="fullScreen"
      onRequestClose={onDismiss}
      onDismiss={onModalHide}
    >
      <View
        style={[
          styles.container,
          {
            backgroundColor: theme.canvas,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        <View style={styles.header}>
          <IconButton name="Luk" icon="close" onPress={onDismiss} />
          <Text style={[typography.title, styles.title, { color: theme.contentPrimary }]}>
            {title}
          </Text>
        </View>

        <View style={styles.body}>
          {searchable ? (
            <SearchField
              variant="catalog"
              accessibilityLabel={searchPlaceholder}
              placeholder={searchPlaceholder}
              value={query}
              onChangeText={onQueryChange}
              onClear={() => onQueryChange("")}
            />
          ) : null}

          {noticeMessage ? <Banner tone="info" message={noticeMessage} /> : null}

          {errorMessage ? (
            <Text style={[typography.body, { color: theme.danger }]}>{errorMessage}</Text>
          ) : null}

          {loading ? (
            <ActivityIndicator color={theme.fillPrimary} style={styles.loader} />
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled">
              {listHeader}
              {items.length === 0 ? (
                <Text style={[typography.caption, { color: theme.contentMuted }]}>
                  {emptyMessage}
                </Text>
              ) : (
                items.map((item) =>
                  renderRow ? (
                    <Fragment key={item.id}>
                      {renderRow(item, {
                        selected: selectedId === item.id,
                        onPress: () => onSelect(item),
                      })}
                    </Fragment>
                  ) : (
                    <ListRow
                      key={item.id}
                      title={item.label}
                      meta={item.meta}
                      testID={`catalog-picker-row-${item.label}`}
                      selected={selectedId === item.id}
                      onPress={() => onSelect(item)}
                    />
                  ),
                )
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapSm,
    paddingHorizontal: space.insetMd,
    paddingBottom: space.insetMd,
  },
  title: {
    flex: 1,
  },
  body: {
    flex: 1,
    paddingHorizontal: space.insetLg,
    gap: space.gapMd,
  },
  loader: {
    marginTop: space.insetMd,
  },
});
