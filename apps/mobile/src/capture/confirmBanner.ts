export type ConfirmBannerKind = "saveError" | "visionSuggestion" | "catalogMiss";

export type ConfirmBannerInput = {
  saveError: boolean;
  visionSuggestionVisible: boolean;
  catalogMiss: boolean;
  clubSheetOpen: boolean;
};

/**
 * Design lock: one banner at a time on Confirm (`docs/design-system.md` Banner §).
 *
 * Design-system gap (flagged for Nicklas — do not invent silently):
 * The lock documents "One banner at a time" but does not define priority when
 * multiple banner conditions are true. Until the design system locks an order,
 * this implementation uses a provisional priority: save error > vision suggestion
 * > catalog miss (main column only). Revisit when Banner priority is added to
 * `docs/design-system.md`.
 */
export function resolveConfirmBanner(input: ConfirmBannerInput): ConfirmBannerKind | null {
  if (input.saveError) {
    return "saveError";
  }

  if (input.visionSuggestionVisible) {
    return "visionSuggestion";
  }

  if (input.catalogMiss && !input.clubSheetOpen) {
    return "catalogMiss";
  }

  return null;
}
