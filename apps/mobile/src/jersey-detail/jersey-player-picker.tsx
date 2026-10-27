import type { CollectionJersey } from "@kit/api-contract";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { searchCatalogPlayers } from "@/api/catalog";
import type { CatalogPickerRow } from "@/catalog/catalogPickerRow";
import {
  CATALOG_SEARCH_ERROR_MESSAGE,
  pickerRowSquadNumber,
  resolvePlayerPickerRows,
} from "@/catalog/liveCatalogPicker";
import { CatalogPickerModal } from "@/components/catalog-picker-modal";
import { NumberEmblem } from "@/components/number-emblem";
import { useTypography } from "@/theme/brand-fonts";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type JerseyPlayerPickerProps = {
  visible: boolean;
  jersey: CollectionJersey;
  accessToken: string | null;
  onSelect: (player: { id: string; label: string; number: string }) => void;
  onRemove: () => void;
  onDismiss: () => void;
  onModalHide: () => void;
};

/** The shirt number of a squad row as the emblem shows it; null when the squad has none. */
export function squadRowNumber(row: CatalogPickerRow): number | null {
  const parsed = Number.parseInt(pickerRowSquadNumber(row), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The squad for the jersey's club (or national team) and season: each row leads with a Number
 * emblem `md`, the current player is selected, and **Fjern spiller** removes him.
 */
export function JerseyPlayerPicker({
  visible,
  jersey,
  accessToken,
  onSelect,
  onRemove,
  onDismiss,
  onModalHide,
}: JerseyPlayerPickerProps) {
  const theme = useTheme();
  const typography = useTypography();
  const sideId = jersey.clubId ?? jersey.nationalTeamId;
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [items, setItems] = useState<CatalogPickerRow[]>([]);

  const runSearch = useCallback(
    async (nextQuery: string) => {
      if (!accessToken || !sideId) {
        setItems([]);
        return;
      }
      setLoading(true);
      setErrorMessage(null);
      try {
        const response = await searchCatalogPlayers(accessToken, nextQuery, "da", {
          clubId: sideId,
          seasonId: jersey.seasonId,
        });
        const resolved = resolvePlayerPickerRows({
          clubId: sideId,
          live: response.items,
          liveFailed: false,
        });
        setItems(resolved.items);
        setErrorMessage(resolved.errorMessage);
      } catch {
        setItems([]);
        setErrorMessage(CATALOG_SEARCH_ERROR_MESSAGE);
      } finally {
        setLoading(false);
      }
    },
    [accessToken, sideId, jersey.seasonId],
  );

  useEffect(() => {
    if (!visible) {
      setQuery("");
      setItems([]);
      setErrorMessage(null);
      return;
    }
    const timer = setTimeout(() => {
      void runSearch(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, visible, runSearch]);

  return (
    <CatalogPickerModal
      visible={visible}
      title="Vælg spiller"
      searchPlaceholder="Søg spiller eller nummer"
      query={query}
      onQueryChange={setQuery}
      items={items}
      selectedId={jersey.playerId ?? null}
      loading={loading}
      errorMessage={errorMessage}
      emptyMessage="Ingen spillere matcher."
      onModalHide={onModalHide}
      listHeader={
        jersey.playerId ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fjern spiller"
            accessibilityHint={`Fjerner ${jersey.playerLabel ?? "spilleren"} fra trøjen`}
            onPress={() => {
              onRemove();
              onDismiss();
            }}
            testID="jersey-detail-player-remove"
            style={({ pressed }) => [styles.remove, pressed && { opacity: 0.9 }]}
          >
            <Text style={[typography.label, { color: theme.danger }]}>Fjern spiller</Text>
          </Pressable>
        ) : null
      }
      renderRow={(item, row) => {
        const number = squadRowNumber(item);
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={number === null ? item.label : `${item.label}, nummer ${number}`}
            accessibilityState={{ selected: row.selected }}
            onPress={row.onPress}
            testID={`jersey-detail-player-${item.id}`}
            style={({ pressed }) => [
              styles.row,
              (pressed || row.selected) && { backgroundColor: theme.fillSecondary },
            ]}
          >
            <NumberEmblem
              size="md"
              state={row.selected ? "selected" : "rest"}
              number={number ?? undefined}
            />
            <Text
              style={[
                typography.label,
                styles.name,
                { color: theme.contentPrimary },
                row.selected && styles.nameSelected,
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      }}
      onSelect={(item) => {
        onSelect({ id: item.id, label: item.label, number: pickerRowSquadNumber(item) });
        onDismiss();
      }}
      onDismiss={onDismiss}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapMd,
    paddingVertical: space.gapSm,
    paddingHorizontal: space.insetSm,
    borderRadius: radius.md,
  },
  name: {
    flex: 1,
  },
  nameSelected: {
    fontWeight: "600",
  },
  remove: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: space.insetSm,
  },
});
