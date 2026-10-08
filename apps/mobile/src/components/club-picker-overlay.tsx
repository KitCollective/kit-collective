import { useCallback, useEffect, useState } from "react";
import { searchCatalogClubs } from "@/api/catalog";
import { formatCatalogMissSheetMessage } from "@/capture/catalogMissHint";
import type { CatalogPickerRow } from "@/catalog/catalogPickerRow";
import { CATALOG_SEARCH_ERROR_MESSAGE, resolveClubPickerRows } from "@/catalog/liveCatalogPicker";
import { CatalogPickerModal } from "@/components/catalog-picker-modal";

type ClubPickerOverlayProps = {
  visible: boolean;
  accessToken?: string | null;
  selectedClubId: string | null;
  initialQuery?: string | null;
  catalogMissHint?: string | null;
  onSelect: (club: CatalogPickerRow) => void;
  onDismiss: () => void;
};

export function ClubPickerOverlay({
  visible,
  accessToken,
  selectedClubId,
  initialQuery = null,
  catalogMissHint = null,
  onSelect,
  onDismiss,
}: ClubPickerOverlayProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [items, setItems] = useState<CatalogPickerRow[]>([]);

  const runSearch = useCallback(
    async (nextQuery: string) => {
      const trimmed = nextQuery.trim();

      if (!accessToken) {
        const resolved = resolveClubPickerRows({
          authenticated: false,
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
        const response = await searchCatalogClubs(accessToken, trimmed, "da");
        const resolved = resolveClubPickerRows({
          authenticated: true,
          live: response.clubs,
          liveFailed: false,
        });
        setItems(resolved.items);
        setErrorMessage(resolved.errorMessage);
      } catch {
        const resolved = resolveClubPickerRows({
          authenticated: true,
          live: null,
          liveFailed: true,
        });
        setItems(resolved.items);
        setErrorMessage(resolved.errorMessage ?? CATALOG_SEARCH_ERROR_MESSAGE);
      } finally {
        setLoading(false);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    if (!visible) {
      setQuery("");
      setItems([]);
      setErrorMessage(null);
      return;
    }

    if (initialQuery?.trim()) {
      setQuery(initialQuery.trim());
    }
  }, [initialQuery, visible]);

  useEffect(() => {
    if (!visible) {
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
      title="Vælg klub eller landshold"
      searchPlaceholder="Søg klub eller landshold"
      query={query}
      onQueryChange={setQuery}
      items={items}
      selectedId={selectedClubId}
      loading={loading}
      errorMessage={errorMessage}
      noticeMessage={catalogMissHint ? formatCatalogMissSheetMessage(catalogMissHint) : null}
      emptyMessage={
        !accessToken ? "Log ind for at søge i kataloget." : "Ingen klubber eller landshold matcher."
      }
      onSelect={(item) => {
        onSelect(item);
        onDismiss();
      }}
      onDismiss={onDismiss}
    />
  );
}
