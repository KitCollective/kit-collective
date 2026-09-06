import { useCallback, useEffect, useState } from "react";
import { searchCatalogClubs } from "@/api/catalog";
import { type CatalogPickerRow, searchDummyClubs } from "@/catalog/dummyCatalog";
import { CatalogPickerModal } from "@/components/catalog-picker-modal";

type ClubPickerOverlayProps = {
  visible: boolean;
  accessToken?: string | null;
  selectedClubId: string | null;
  onSelect: (club: CatalogPickerRow) => void;
  onDismiss: () => void;
};

function mergeClubRows(live: CatalogPickerRow[], dummy: CatalogPickerRow[]): CatalogPickerRow[] {
  const seen = new Set(live.map((row) => row.id));
  return [...live, ...dummy.filter((row) => !seen.has(row.id))];
}

export function ClubPickerOverlay({
  visible,
  accessToken,
  selectedClubId,
  onSelect,
  onDismiss,
}: ClubPickerOverlayProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [items, setItems] = useState<CatalogPickerRow[]>(() => searchDummyClubs(""));

  const runSearch = useCallback(
    async (nextQuery: string) => {
      const dummy = searchDummyClubs(nextQuery);
      const trimmed = nextQuery.trim();

      if (!accessToken || trimmed.length < 2) {
        setItems(dummy);
        setErrorMessage(null);
        return;
      }

      setLoading(true);
      setErrorMessage(null);
      try {
        const response = await searchCatalogClubs(accessToken, trimmed, "da");
        setItems(mergeClubRows(response.clubs, dummy));
      } catch {
        setItems(dummy);
        setErrorMessage("Kunne ikke søge i kataloget. Viser testdata.");
      } finally {
        setLoading(false);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    if (!visible) {
      setQuery("");
      setItems(searchDummyClubs(""));
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
      title="Vælg klub"
      searchPlaceholder="Søg klub"
      query={query}
      onQueryChange={setQuery}
      items={items}
      selectedId={selectedClubId}
      loading={loading}
      errorMessage={errorMessage}
      emptyMessage="Ingen klubber matcher."
      onSelect={(item) => {
        onSelect(item);
        onDismiss();
      }}
      onDismiss={onDismiss}
    />
  );
}
