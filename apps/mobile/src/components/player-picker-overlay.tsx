import { useCallback, useEffect, useState } from "react";
import { searchCatalogPlayers } from "@/api/catalog";
import type { CatalogPickerRow } from "@/catalog/catalogPickerRow";
import {
  CATALOG_SEARCH_ERROR_MESSAGE,
  pickerRowSquadNumber,
  resolvePlayerPickerRows,
} from "@/catalog/liveCatalogPicker";
import { CatalogPickerModal } from "@/components/catalog-picker-modal";

type PlayerPickerOverlayProps = {
  visible: boolean;
  accessToken?: string | null;
  clubId: string | null;
  seasonId: string | null;
  selectedId: string | null;
  onSelect: (item: CatalogPickerRow & { number: string }) => void;
  onDismiss: () => void;
};

export function PlayerPickerOverlay({
  visible,
  accessToken,
  clubId,
  seasonId,
  selectedId,
  onSelect,
  onDismiss,
}: PlayerPickerOverlayProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [items, setItems] = useState<CatalogPickerRow[]>([]);

  const runSearch = useCallback(
    async (nextQuery: string) => {
      if (!clubId) {
        setItems([]);
        setErrorMessage(null);
        return;
      }

      if (!accessToken) {
        const resolved = resolvePlayerPickerRows({
          clubId,
          live: null,
          liveFailed: false,
        });
        setItems(resolved.items);
        setErrorMessage(resolved.errorMessage);
        return;
      }

      setLoading(true);
      setErrorMessage(null);
      try {
        const response = await searchCatalogPlayers(accessToken, nextQuery, "da", {
          clubId,
          seasonId: seasonId ?? undefined,
        });
        const resolved = resolvePlayerPickerRows({
          clubId,
          live: response.items,
          liveFailed: false,
        });
        setItems(resolved.items);
        setErrorMessage(resolved.errorMessage);
      } catch {
        const resolved = resolvePlayerPickerRows({
          clubId,
          live: null,
          liveFailed: true,
        });
        setItems(resolved.items);
        setErrorMessage(resolved.errorMessage ?? CATALOG_SEARCH_ERROR_MESSAGE);
      } finally {
        setLoading(false);
      }
    },
    [accessToken, clubId, seasonId],
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
      selectedId={selectedId}
      loading={loading}
      errorMessage={errorMessage}
      emptyMessage={
        !accessToken
          ? "Log ind for at søge i kataloget."
          : clubId
            ? "Ingen spillere matcher."
            : "Vælg en klub for at se spillere."
      }
      onSelect={(item) => {
        onSelect({
          ...item,
          number: pickerRowSquadNumber(item),
        });
        onDismiss();
      }}
      onDismiss={() => {
        setQuery("");
        onDismiss();
      }}
    />
  );
}
