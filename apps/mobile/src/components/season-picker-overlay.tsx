import type { CatalogPickerItem } from "@kit/api-contract";
import { useMemo, useState } from "react";
import { type CatalogPickerRow, dummySeasonsForClub } from "@/catalog/dummyCatalog";
import { CatalogPickerModal } from "@/components/catalog-picker-modal";

type SeasonPickerOverlayProps = {
  visible: boolean;
  seasons?: CatalogPickerItem[];
  clubId?: string | null;
  selectedId: string | null;
  loading?: boolean;
  onSelect: (item: CatalogPickerRow) => void;
  onDismiss: () => void;
};

export function SeasonPickerOverlay({
  visible,
  seasons,
  clubId,
  selectedId,
  loading = false,
  onSelect,
  onDismiss,
}: SeasonPickerOverlayProps) {
  const [query, setQuery] = useState("");
  const items = useMemo(() => {
    const source: CatalogPickerRow[] =
      seasons && seasons.length > 0
        ? seasons.map((season) => ({ id: season.id, label: season.label }))
        : clubId
          ? dummySeasonsForClub(clubId)
          : [];
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return source;
    }
    return source.filter((row) => row.label.toLowerCase().includes(trimmed));
  }, [clubId, query, seasons]);

  return (
    <CatalogPickerModal
      visible={visible}
      title="Vælg sæson"
      searchPlaceholder="Søg sæson"
      query={query}
      onQueryChange={setQuery}
      items={items}
      selectedId={selectedId}
      loading={loading}
      emptyMessage="Ingen sæsoner for denne klub."
      onSelect={(item) => {
        onSelect(item);
        onDismiss();
      }}
      onDismiss={() => {
        setQuery("");
        onDismiss();
      }}
    />
  );
}
