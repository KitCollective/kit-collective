import type {
  VisionEvalClass,
  VisionImproveEntityType,
  VisionImproveField,
  VisionImproveKind,
} from "@kit/domain";
import {
  catalogHintCompactMatches,
  compactCatalogHint,
  type VisionEvalEntityHints,
  type VisionEvalIdentityFields,
} from "./vision-eval.js";

export type VisionImproveProposeInput = {
  evalClass: VisionEvalClass;
  selected: VisionEvalIdentityFields;
  suggested?: VisionEvalIdentityFields;
  entityHints?: VisionEvalEntityHints;
  selectedCatalogLabels?: VisionEvalEntityHints;
};

export type VisionImproveProposal = {
  kind: VisionImproveKind;
  fingerprint: string;
  text?: string;
  entityType?: VisionImproveEntityType;
  entityId?: string;
  field?: VisionImproveField;
};

export type VisionImproveFingerprintParts = {
  kind: VisionImproveKind;
  entityType?: VisionImproveEntityType;
  entityId?: string;
  field?: VisionImproveField;
  text?: string;
};

const DANISH_SHAPED_HINT = /[æøåÆØÅ]/;

export function visionImproveKindForEvalClass(
  evalClass: VisionEvalClass,
): VisionImproveKind | null {
  if (evalClass === "alias") {
    return "alias";
  }
  if (evalClass === "coverage") {
    return "seed";
  }
  if (evalClass === "model") {
    return "prompt";
  }
  return null;
}

/** Locale for CatalogLabel alias Apply: da when the hint is Danish-shaped. */
export function aliasLocaleForHint(hint: string): "da" | "en" {
  return DANISH_SHAPED_HINT.test(hint) ? "da" : "en";
}

export function buildVisionImproveFingerprint(parts: VisionImproveFingerprintParts): string {
  const compactText = compactCatalogHint(parts.text ?? "");
  return [
    parts.kind,
    parts.entityType ?? "",
    parts.entityId ?? "",
    parts.field ?? "",
    compactText,
  ].join(":");
}

export function proposeVisionImprove(
  input: VisionImproveProposeInput,
): VisionImproveProposal | null {
  const kind = visionImproveKindForEvalClass(input.evalClass);
  if (!kind) {
    return null;
  }
  const suggested = input.suggested ?? {};
  const draft =
    kind === "alias"
      ? aliasProposal(input)
      : kind === "seed"
        ? seedProposal(input, suggested)
        : promptProposal(input.selected, suggested);
  if (!draft) {
    return null;
  }
  return {
    ...draft,
    kind,
    fingerprint: buildVisionImproveFingerprint({ ...draft, kind }),
  };
}

function aliasProposal(
  input: VisionImproveProposeInput,
): Omit<VisionImproveProposal, "kind" | "fingerprint"> | null {
  const hints = input.entityHints ?? {};
  const labels = input.selectedCatalogLabels ?? {};
  const sideHint = matchingHint(hints.side, labels.side);
  if (sideHint) {
    const side = selectedSideEntity(input.selected);
    if (!side) {
      return null;
    }
    return { text: sideHint, field: "side", ...side };
  }
  const playerHint = matchingHint(hints.player, labels.player);
  if (playerHint && input.selected.playerId) {
    return {
      text: playerHint,
      field: "player",
      entityType: "player",
      entityId: input.selected.playerId,
    };
  }
  const patchHint = matchingHint(hints.patch, labels.patch);
  if (patchHint && input.selected.patchId) {
    return {
      text: patchHint,
      field: "patch",
      entityType: "patch",
      entityId: input.selected.patchId,
    };
  }
  return null;
}

function seedProposal(
  input: VisionImproveProposeInput,
  suggested: VisionEvalIdentityFields,
): Omit<VisionImproveProposal, "kind" | "fingerprint"> | null {
  const selected = input.selected;
  const sideHint = firstHint(input.entityHints?.side);
  if (selectedSideId(selected) && !suggestedSideId(suggested)) {
    const side = selectedSideEntity(selected);
    if (side) {
      return { field: "side", text: sideHint, ...side };
    }
  }
  if (selected.seasonId && !nonemptyId(suggested.seasonId)) {
    return {
      field: "season",
      entityType: "season",
      entityId: selected.seasonId,
      text: sideHint,
    };
  }
  if (selected.type && !suggested.type) {
    const side = selectedSideEntity(selected);
    return {
      field: "type",
      text: selected.type,
      ...(side ?? {}),
    };
  }
  if (nonemptyId(selected.catalogKitId) && !nonemptyId(suggested.catalogKitId)) {
    return {
      field: "catalogKitId",
      entityType: "kit",
      entityId: selected.catalogKitId,
      text: sideHint,
    };
  }
  const side = selectedSideEntity(selected);
  if (!side) {
    return null;
  }
  return { field: "side", text: sideHint, ...side };
}

function promptProposal(
  selected: VisionEvalIdentityFields,
  suggested: VisionEvalIdentityFields,
): Omit<VisionImproveProposal, "kind" | "fingerprint"> {
  if (suggestedSideDiffers(suggested, selected)) {
    const side = selectedSideEntity(selected);
    return {
      field: "side",
      text: arrowText(suggestedSideId(suggested), selectedSideId(selected)),
      ...side,
    };
  }
  if (suggestedUuidDiffers(suggested.seasonId, selected.seasonId)) {
    return {
      field: "season",
      entityType: "season",
      entityId: selected.seasonId,
      text: arrowText(suggested.seasonId, selected.seasonId),
    };
  }
  if (suggested.type && suggested.type !== selected.type) {
    const side = selectedSideEntity(selected);
    return {
      field: "type",
      text: arrowText(suggested.type, selected.type),
      ...side,
    };
  }
  if (suggestedUuidDiffers(suggested.catalogKitId, selected.catalogKitId)) {
    return {
      field: "catalogKitId",
      entityType: "kit",
      entityId: selected.catalogKitId ?? suggested.catalogKitId,
      text: arrowText(suggested.catalogKitId, selected.catalogKitId),
    };
  }
  if (suggestedUuidDiffers(suggested.playerId, selected.playerId)) {
    return {
      field: "player",
      entityType: "player",
      entityId: selected.playerId ?? suggested.playerId,
      text: arrowText(suggested.playerId, selected.playerId),
    };
  }
  if (suggestedUuidDiffers(suggested.patchId, selected.patchId)) {
    return {
      field: "patch",
      entityType: "patch",
      entityId: selected.patchId ?? suggested.patchId,
      text: arrowText(suggested.patchId, selected.patchId),
    };
  }
  const side = selectedSideEntity(selected);
  return {
    field: "side",
    text: arrowText(suggestedSideId(suggested), selectedSideId(selected)),
    ...side,
  };
}

function matchingHint(
  hints: string[] | undefined,
  labels: string[] | undefined,
): string | undefined {
  if (!hints?.length || !labels?.length) {
    return undefined;
  }
  for (const hint of hints) {
    if (!hint.trim()) {
      continue;
    }
    for (const label of labels) {
      if (catalogHintCompactMatches(hint, label)) {
        return hint;
      }
    }
  }
  return undefined;
}

function firstHint(hints: string[] | undefined): string | undefined {
  const hint = hints?.find((entry) => entry.trim());
  return hint?.trim() || undefined;
}

function selectedSideEntity(
  selected: VisionEvalIdentityFields,
): { entityType: "club" | "national_team"; entityId: string } | undefined {
  const clubId = nonemptyId(selected.clubId);
  if (clubId) {
    return { entityType: "club", entityId: clubId };
  }
  const nationalTeamId = nonemptyId(selected.nationalTeamId);
  if (nationalTeamId) {
    return { entityType: "national_team", entityId: nationalTeamId };
  }
  return undefined;
}

function nonemptyId(value: string | undefined): string | undefined {
  return value?.trim() ? value : undefined;
}

function suggestedSideId(suggested: VisionEvalIdentityFields): string | undefined {
  return nonemptyId(suggested.clubId) ?? nonemptyId(suggested.nationalTeamId);
}

function selectedSideId(selected: VisionEvalIdentityFields): string | undefined {
  return nonemptyId(selected.clubId) ?? nonemptyId(selected.nationalTeamId);
}

function suggestedSideDiffers(
  suggested: VisionEvalIdentityFields,
  selected: VisionEvalIdentityFields,
): boolean {
  const suggestedId = suggestedSideId(suggested);
  return Boolean(suggestedId) && suggestedId !== selectedSideId(selected);
}

function suggestedUuidDiffers(
  suggested: string | undefined,
  selected: string | undefined,
): boolean {
  const suggestedId = nonemptyId(suggested);
  return Boolean(suggestedId) && suggestedId !== nonemptyId(selected);
}

function arrowText(suggested: string | undefined, selected: string | undefined): string {
  return `${suggested?.trim() ?? ""}->${selected?.trim() ?? ""}`;
}
