import { JERSEY_CONDITION_LABELS_DA, JERSEY_SIZE_LABELS_DA, KIT_TYPE_LABELS_DA } from "@kit/domain";
import type { CaptureJerseyDraft } from "./captureSessionTypes";

/** Club, season, and kit type must be set before Save. Player and badge do not block. */
export const DATA_REQUIRED_COUNT = 3;

/** Size and condition are always required. */
export const DETAILS_REQUIRED_COUNT = 2;

export type SectionProgressTone = "empty" | "partial" | "complete";

export type ConfirmSectionFact = {
  key: string;
  placeholder: string;
  value: string | null;
};

export function dataRequiredFilledCount(draft: CaptureJerseyDraft): number {
  let filled = 0;
  if (draft.clubId) {
    filled += 1;
  }
  if (draft.seasonId) {
    filled += 1;
  }
  if (draft.kitTypeSelected && draft.kitType !== null) {
    filled += 1;
  }
  return filled;
}

export function detailsRequiredFilledCount(draft: CaptureJerseyDraft): number {
  let filled = 0;
  if (draft.sizeSelected && draft.size !== null) {
    filled += 1;
  }
  if (draft.conditionSelected && draft.condition !== null) {
    filled += 1;
  }
  return filled;
}

export function sectionProgressRatio(filled: number, required: number): number {
  if (required <= 0) {
    return 0;
  }
  return Math.min(1, filled / required);
}

export function sectionProgressTone(filled: number, required: number): SectionProgressTone {
  if (filled <= 0 || required <= 0) {
    return "empty";
  }
  if (filled >= required) {
    return "complete";
  }
  return "partial";
}

export function dataSectionFacts(draft: CaptureJerseyDraft): ConfirmSectionFact[] {
  return [
    { key: "club", placeholder: "Klub", value: draft.clubLabel },
    { key: "season", placeholder: "Sæson", value: draft.seasonLabel },
    {
      key: "type",
      placeholder: "Type",
      value: draft.kitTypeSelected && draft.kitType ? KIT_TYPE_LABELS_DA[draft.kitType] : null,
    },
    {
      key: "player",
      placeholder: "Spiller",
      value: draft.playerName.trim() ? draft.playerName.trim() : null,
    },
  ];
}

export function detailsSectionFacts(draft: CaptureJerseyDraft): ConfirmSectionFact[] {
  return [
    {
      key: "size",
      placeholder: "Størrelse",
      value: draft.sizeSelected && draft.size ? JERSEY_SIZE_LABELS_DA[draft.size] : null,
    },
    {
      key: "condition",
      placeholder: "Stand",
      value:
        draft.conditionSelected && draft.condition
          ? JERSEY_CONDITION_LABELS_DA[draft.condition]
          : null,
    },
  ];
}
