import type { VisionFieldPreselect, VisionSuggestions } from "@kit/api-contract";
import type { ConfirmSectionFact } from "./confirmSectionProgress";

/** Data facts Vision can fill. Detaljer (size/condition) stay human-only. */
export const VISION_DATA_FIELDS = ["club", "season", "type", "player"] as const;
export type VisionDataField = (typeof VISION_DATA_FIELDS)[number];

/**
 * Quiet per-capsule marks on the Confirm hub Data row.
 *
 * - `pending` — identity is in flight; grouping has closed (muted sparkle).
 * - `review` — Vision filled or suggested this field; collector has not opened Data yet (eye).
 * - `hit` — same, after the collector has looked (check).
 * - `miss` — identity ran and this field has no catalog hit (quiet close).
 * - `rejected` — collector overrode or dismissed; the machine stepped back (ghost sparkle).
 */
export type ConfirmVisionFieldMark = "pending" | "review" | "hit" | "miss" | "rejected";

export type ConfirmVisionFieldMarkInput = {
  /** Identity job settled (ready, failed, or timed out). Grouping alone is not this. */
  identityCompleted: boolean;
  /** Identity suggest is in flight after grouping. */
  analyzing: boolean;
  /** Collector opened the Data drill after identity settled. */
  reviewed: boolean;
  catalogMiss: boolean;
  /** Collector dismissed the suggest-only Brug strip. */
  dismissed: boolean;
  fieldPreselect?: VisionFieldPreselect;
  suggestions?: VisionSuggestions | null;
  edited: {
    club: boolean;
    season: boolean;
    type: boolean;
    player: boolean;
  };
};

function isVisionDataField(key: string): key is VisionDataField {
  return (VISION_DATA_FIELDS as readonly string[]).includes(key);
}

function fieldWasSuggested(field: VisionDataField, input: ConfirmVisionFieldMarkInput): boolean {
  const preselect = input.fieldPreselect ?? {};
  const suggestions = input.suggestions;

  switch (field) {
    case "club":
      return Boolean(
        preselect.club ||
          preselect.nationalTeam ||
          suggestions?.clubId ||
          suggestions?.nationalTeamId,
      );
    case "season":
      return Boolean(preselect.season || suggestions?.seasonId);
    case "type":
      return Boolean(preselect.type || suggestions?.type);
    case "player":
      return Boolean(preselect.player || suggestions?.playerId);
    default: {
      const _exhaustive: never = field;
      return _exhaustive;
    }
  }
}

export function resolveConfirmVisionFieldMark(
  field: VisionDataField,
  input: ConfirmVisionFieldMarkInput,
): ConfirmVisionFieldMark | undefined {
  if (input.analyzing && !input.identityCompleted) {
    return "pending";
  }
  if (!input.identityCompleted) {
    return undefined;
  }

  if (input.edited[field]) {
    return "rejected";
  }

  const suggested = fieldWasSuggested(field, input);
  if (suggested && input.dismissed) {
    return "rejected";
  }
  if (suggested) {
    return input.reviewed ? "hit" : "review";
  }

  return "miss";
}

export function attachConfirmVisionFieldMarks(
  facts: ConfirmSectionFact[],
  input: ConfirmVisionFieldMarkInput,
): ConfirmSectionFact[] {
  return facts.map((fact) => {
    if (!isVisionDataField(fact.key)) {
      return fact;
    }
    return {
      ...fact,
      visionMark: resolveConfirmVisionFieldMark(fact.key, input),
    };
  });
}
