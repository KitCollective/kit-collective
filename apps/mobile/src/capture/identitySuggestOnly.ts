import type { VisionFieldPreselect, VisionJobResponse, VisionSuggestions } from "@kit/api-contract";

export type IdentityManualEditMask = {
  club?: boolean;
  season?: boolean;
  type?: boolean;
  player?: boolean;
  badge?: boolean;
};

function filterSuggestOnlyFields(
  suggestions: VisionSuggestions,
  fieldPreselect: VisionFieldPreselect,
  manualEdits: IdentityManualEditMask = {},
): VisionSuggestions | null {
  const filtered: VisionSuggestions = {};

  if (suggestions.clubId && !fieldPreselect.club && !manualEdits.club) {
    filtered.clubId = suggestions.clubId;
    if (suggestions.clubLabel) {
      filtered.clubLabel = suggestions.clubLabel;
    }
  }

  if (suggestions.seasonId && !fieldPreselect.season && !manualEdits.season) {
    filtered.seasonId = suggestions.seasonId;
    if (suggestions.seasonLabel) {
      filtered.seasonLabel = suggestions.seasonLabel;
    }
  }

  if (suggestions.type && !fieldPreselect.type && !manualEdits.type) {
    filtered.type = suggestions.type;
    if (suggestions.catalogKitId) {
      filtered.catalogKitId = suggestions.catalogKitId;
    }
  }

  if (suggestions.playerId && !fieldPreselect.player && !manualEdits.player) {
    filtered.playerId = suggestions.playerId;
    if (suggestions.playerLabel) {
      filtered.playerLabel = suggestions.playerLabel;
    }
    if (suggestions.playerNumber) {
      filtered.playerNumber = suggestions.playerNumber;
    }
  }

  if (suggestions.patchId && !fieldPreselect.badge && !manualEdits.badge) {
    filtered.patchId = suggestions.patchId;
    if (suggestions.patchLabel) {
      filtered.patchLabel = suggestions.patchLabel;
    }
  }

  return Object.keys(filtered).length > 0 ? filtered : null;
}

/** Vision job narrowed to fields that still need Brug/Luk after per-field preselect. */
export function buildSuggestOnlyVisionJob(
  job: VisionJobResponse,
  manualEdits: IdentityManualEditMask = {},
): VisionJobResponse | null {
  if (!job.suggestions) {
    return null;
  }

  const filtered = filterSuggestOnlyFields(job.suggestions, job.fieldPreselect ?? {}, manualEdits);
  if (!filtered) {
    return null;
  }

  return {
    ...job,
    suggestions: filtered,
    fieldPreselect: undefined,
    preselect: false,
  };
}
