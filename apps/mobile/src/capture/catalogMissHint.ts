import type { VisionJobResponse } from "@kit/api-contract";

/** Picks the editable side hint from a catalogMiss job (club or national team). */
export function resolveVisionCatalogMissHint(job: VisionJobResponse): string | null {
  return job.nationalTeamHint ?? job.clubHint ?? null;
}

/** Danish banner copy for catalogMiss with an optional model hint. */
export function formatCatalogMissBannerMessage(hint: string | null): string {
  if (hint) {
    return `«${hint}» findes ikke i kataloget endnu. Dit draft bliver gemt.`;
  }
  return "Klubben findes ikke i kataloget endnu. Dit draft bliver gemt.";
}

/** Shorter in-sheet copy when the club picker is open. */
export function formatCatalogMissSheetMessage(hint: string | null): string {
  if (hint) {
    return `«${hint}» findes ikke i kataloget endnu. Søg selv nedenfor.`;
  }
  return "Klubben findes ikke i kataloget endnu.";
}
