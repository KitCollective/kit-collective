export type ConfirmBannerKind = "saveError" | "visionSuggestion" | "catalogMiss";

export type ConfirmBannerInput = {
  saveError: boolean;
  visionSuggestionVisible: boolean;
  catalogMiss: boolean;
  clubSheetOpen: boolean;
};

/**
 * Design lock: one banner at a time on Confirm.
 * Priority: save error > vision suggestion > catalog miss (main column only).
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
