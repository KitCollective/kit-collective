import type { CaptureJerseyDraft } from "./captureSessionTypes";

export function getSaveBlockMessage(draft: CaptureJerseyDraft): string | null {
  if (draft.photos.length === 0) {
    return "Tilføj mindst ét foto.";
  }
  if (!draft.clubId) {
    return "Vælg en klub.";
  }
  if (!draft.seasonId) {
    return "Vælg en sæson.";
  }
  if (!draft.kitTypeSelected) {
    return "Vælg en type.";
  }
  if (!draft.sizeSelected) {
    return "Vælg en størrelse.";
  }
  if (!draft.conditionSelected) {
    return "Vælg stand.";
  }
  return null;
}
