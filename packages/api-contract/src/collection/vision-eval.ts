import { type KitType, VISION_EVAL_CLASSES, type VisionEvalClass } from "@kit/domain";
import type { VisionJobStatus, VisionSuggestions } from "./vision.js";

export { VISION_EVAL_CLASSES, type VisionEvalClass };

export const VISION_EVAL_FIELD_HIT_KEYS = [
  "side",
  "season",
  "type",
  "catalogKitId",
  "player",
  "patch",
] as const;

export type VisionEvalFieldHitKey = (typeof VISION_EVAL_FIELD_HIT_KEYS)[number];

export type VisionEvalFieldHits = Record<VisionEvalFieldHitKey, boolean>;

export type VisionEvalIdentityFields = {
  clubId?: string;
  nationalTeamId?: string;
  seasonId?: string;
  type?: KitType;
  catalogKitId?: string;
  playerId?: string;
  patchId?: string;
};

export type VisionEvalEntityHints = {
  side?: string[];
  player?: string[];
  patch?: string[];
};

export type ClassifyVisionEvalInput = {
  status: VisionJobStatus;
  suggested?: VisionSuggestions | VisionEvalIdentityFields;
  selected: VisionEvalIdentityFields & { seasonId: string; type: KitType };
  catalogMiss?: boolean;
  zeroKitHits?: boolean;
  entityHints?: VisionEvalEntityHints;
  selectedCatalogLabels?: VisionEvalEntityHints;
};

export type ClassifyVisionEvalResult = {
  evalClass: VisionEvalClass;
  fieldHits: VisionEvalFieldHits;
};

const DIACRITIC_FOLD: Record<string, string> = {
  æ: "ae",
  ø: "o",
  å: "a",
  ä: "a",
  ö: "o",
  ü: "u",
  ß: "ss",
};

/** Same diacritic/punctuation fold as catalog kit-lock compactCatalogHint. */
export function compactCatalogHint(value: string): string {
  const normalized = value.trim().toLowerCase();
  const stripped = normalized.normalize("NFD").replace(/\p{M}/gu, "");
  const folded = [...stripped].map((character) => DIACRITIC_FOLD[character] ?? character).join("");
  return folded.replace(/[^a-z0-9]+/g, "");
}

export function catalogHintCompactMatches(hint: string, label: string): boolean {
  const compactHint = compactCatalogHint(hint);
  const compactLabel = compactCatalogHint(label);
  return compactHint.length >= 3 && compactHint === compactLabel;
}

function nonemptyId(value: string | undefined): string | undefined {
  return value?.trim() ? value : undefined;
}

function uuidHit(
  selected: string | undefined,
  suggested: string | undefined,
  optional: boolean,
): boolean {
  const selectedId = nonemptyId(selected);
  const suggestedId = nonemptyId(suggested);
  if (optional && !selectedId && !suggestedId) {
    return true;
  }
  return selectedId === suggestedId;
}

function sideHit(selected: VisionEvalIdentityFields, suggested: VisionEvalIdentityFields): boolean {
  return (
    nonemptyId(selected.clubId) === nonemptyId(suggested.clubId) &&
    nonemptyId(selected.nationalTeamId) === nonemptyId(suggested.nationalTeamId)
  );
}

function suggestedUuidDiffers(
  suggested: string | undefined,
  selected: string | undefined,
): boolean {
  const suggestedId = nonemptyId(suggested);
  return Boolean(suggestedId) && suggestedId !== nonemptyId(selected);
}

function anyIdentitySuggestionDiffers(
  suggested: VisionEvalIdentityFields,
  selected: VisionEvalIdentityFields,
): boolean {
  if (nonemptyId(suggested.clubId) || nonemptyId(suggested.nationalTeamId)) {
    if (!sideHit(selected, suggested)) {
      return true;
    }
  }
  if (suggestedUuidDiffers(suggested.seasonId, selected.seasonId)) {
    return true;
  }
  if (suggested.type && suggested.type !== selected.type) {
    return true;
  }
  if (suggestedUuidDiffers(suggested.catalogKitId, selected.catalogKitId)) {
    return true;
  }
  if (suggestedUuidDiffers(suggested.playerId, selected.playerId)) {
    return true;
  }
  if (suggestedUuidDiffers(suggested.patchId, selected.patchId)) {
    return true;
  }
  return false;
}

function entityHintMatchesLabels(
  hints: string[] | undefined,
  selectedLabels: string[] | undefined,
): boolean {
  if (!hints?.length || !selectedLabels?.length) {
    return false;
  }
  for (const hint of hints) {
    if (!hint.trim()) {
      continue;
    }
    for (const label of selectedLabels) {
      if (catalogHintCompactMatches(hint, label)) {
        return true;
      }
    }
  }
  return false;
}

function suggestedUuidEmptyOrDifferent(
  suggested: string | undefined,
  selected: string | undefined,
): boolean {
  const suggestedId = nonemptyId(suggested);
  return !suggestedId || suggestedId !== nonemptyId(selected);
}

function suggestedSideId(suggested: VisionEvalIdentityFields): string | undefined {
  return nonemptyId(suggested.clubId) ?? nonemptyId(suggested.nationalTeamId);
}

function selectedSideId(selected: VisionEvalIdentityFields): string | undefined {
  return nonemptyId(selected.clubId) ?? nonemptyId(selected.nationalTeamId);
}

function coverageMiss(
  input: ClassifyVisionEvalInput,
  suggested: VisionEvalIdentityFields,
): boolean {
  if (!input.catalogMiss && !input.zeroKitHits) {
    return false;
  }
  const selected = input.selected;
  const requiredEmptySuggestion =
    (Boolean(selectedSideId(selected)) && !suggestedSideId(suggested)) ||
    (Boolean(selected.seasonId) && !nonemptyId(suggested.seasonId)) ||
    (Boolean(selected.type) && !suggested.type) ||
    (Boolean(nonemptyId(selected.catalogKitId)) && !nonemptyId(suggested.catalogKitId));
  return requiredEmptySuggestion;
}

function fieldHitsFor(
  selected: ClassifyVisionEvalInput["selected"],
  suggested: VisionEvalIdentityFields,
): VisionEvalFieldHits {
  return {
    side: sideHit(selected, suggested),
    season: nonemptyId(selected.seasonId) === nonemptyId(suggested.seasonId),
    type: selected.type === suggested.type,
    catalogKitId: uuidHit(selected.catalogKitId, suggested.catalogKitId, true),
    player: uuidHit(selected.playerId, suggested.playerId, true),
    patch: uuidHit(selected.patchId, suggested.patchId, true),
  };
}

function allIdentityFieldHits(fieldHits: VisionEvalFieldHits): boolean {
  return VISION_EVAL_FIELD_HIT_KEYS.every((key) => fieldHits[key]);
}

function aliasFromEntityHints(
  input: ClassifyVisionEvalInput,
  suggested: VisionEvalIdentityFields,
): boolean {
  const hints = input.entityHints ?? {};
  const labels = input.selectedCatalogLabels ?? {};

  if (
    entityHintMatchesLabels(hints.side, labels.side) &&
    suggestedUuidEmptyOrDifferent(suggestedSideId(suggested), selectedSideId(input.selected))
  ) {
    return true;
  }
  if (
    entityHintMatchesLabels(hints.player, labels.player) &&
    suggestedUuidEmptyOrDifferent(suggested.playerId, input.selected.playerId)
  ) {
    return true;
  }
  if (
    entityHintMatchesLabels(hints.patch, labels.patch) &&
    suggestedUuidEmptyOrDifferent(suggested.patchId, input.selected.patchId)
  ) {
    return true;
  }
  return false;
}

/**
 * Scores a Vision label at Save. Deterministic — no VLM.
 * Priority: transport > model > alias > coverage > accepted.
 */
export function classifyVisionEval(input: ClassifyVisionEvalInput): ClassifyVisionEvalResult {
  const suggested = input.suggested ?? {};
  const fieldHits = fieldHitsFor(input.selected, suggested);

  if (input.status === "pending" || input.status === "failed" || input.status === "noop") {
    return { evalClass: "transport", fieldHits };
  }

  if (anyIdentitySuggestionDiffers(suggested, input.selected)) {
    return { evalClass: "model", fieldHits };
  }

  if (aliasFromEntityHints(input, suggested)) {
    return { evalClass: "alias", fieldHits };
  }

  if (coverageMiss(input, suggested) || !allIdentityFieldHits(fieldHits)) {
    return { evalClass: "coverage", fieldHits };
  }

  return { evalClass: "accepted", fieldHits };
}
