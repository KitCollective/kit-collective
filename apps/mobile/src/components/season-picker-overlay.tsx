import type { CatalogPickerItem } from "@kit/api-contract";
import { useMemo, useState } from "react";
import type { CatalogPickerRow } from "@/catalog/catalogPickerRow";
import { resolveSeasonPickerRows } from "@/catalog/liveCatalogPicker";
import { CatalogPickerModal } from "@/components/catalog-picker-modal";

type SeasonPickerOverlayProps = {
  visible: boolean;
  seasons?: CatalogPickerItem[];
  clubId?: string | null;
  selectedId: string | null;
  loading?: boolean;
  errorMessage?: string | null;
  onSelect: (item: CatalogPickerRow) => void;
  onDismiss: () => void;
};

export function SeasonPickerOverlay({
  visible,
  seasons,
  selectedId,
  loading = false,
  errorMessage = null,
  onSelect,
  onDismiss,
}: SeasonPickerOverlayProps) {
  const [query, setQuery] = useState("");
  const items = useMemo(() => {
    const source = resolveSeasonPickerRows({ liveSeasons: seasons });
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return source;
    }
    return source.filter((row) => row.label.toLowerCase().includes(trimmed));
  }, [query, seasons]);

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
      errorMessage={errorMessage}
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
