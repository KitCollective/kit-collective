import { useMemo, useState } from "react";
import {
  type CatalogPickerRow,
  dummyPlayerById,
  dummyPlayersForClub,
} from "@/catalog/dummyCatalog";
import { CatalogPickerModal } from "@/components/catalog-picker-modal";

type PlayerPickerOverlayProps = {
  visible: boolean;
  clubId: string | null;
  seasonId: string | null;
  selectedId: string | null;
  onSelect: (item: CatalogPickerRow & { number: string }) => void;
  onDismiss: () => void;
};

export function PlayerPickerOverlay({
  visible,
  clubId,
  seasonId,
  selectedId,
  onSelect,
  onDismiss,
}: PlayerPickerOverlayProps) {
  const [query, setQuery] = useState("");
  const items = useMemo(() => {
    if (!clubId) {
      return [];
    }
    return dummyPlayersForClub(clubId, seasonId, query);
  }, [clubId, query, seasonId]);

  return (
    <CatalogPickerModal
      visible={visible}
      title="Vælg spiller"
      searchPlaceholder="Søg spiller eller nummer"
      query={query}
      onQueryChange={setQuery}
      items={items}
      selectedId={selectedId}
      emptyMessage="Vælg en klub for at se spillere."
      onSelect={(item) => {
        if (!clubId) {
          return;
        }
        const player = dummyPlayerById(clubId, item.id);
        onSelect({
          ...item,
          number: player?.number ?? "",
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
