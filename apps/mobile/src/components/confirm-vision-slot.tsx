import { formatCatalogMissBannerMessage } from "@/capture/catalogMissHint";
import { Banner } from "@/components/catalog-ui";
import { Button } from "@/components/ui";

type ConfirmVisionSlotProps = {
  catalogMiss?: boolean;
  catalogMissHint?: string | null;
};

/**
 * What is left of the Vision slot after the Identity block took over the identity result
 * (design lock: Confirm and Save, Revision 2026-10-09): the catalog-miss note. Renders nothing
 * otherwise; there is no status banner, and grouping lives on the bulk overview, not here.
 */
export function ConfirmVisionSlot({
  catalogMiss = false,
  catalogMissHint = null,
}: ConfirmVisionSlotProps) {
  if (catalogMiss) {
    return (
      <Banner
        tone="info"
        message={formatCatalogMissBannerMessage(catalogMissHint)}
        action={<Button label="Opgrader (kommer snart)" variant="tertiary" disabled />}
      />
    );
  }

  return null;
}
