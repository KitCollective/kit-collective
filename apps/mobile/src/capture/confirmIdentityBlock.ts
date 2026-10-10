import type { VisionSuggestions } from "@kit/api-contract";
import { KIT_TYPE_LABELS_DA } from "@kit/domain";
import { canSave } from "./captureSession";
import type { CaptureJerseyDraft } from "./captureSessionTypes";

/**
 * The Identity block on the Confirm hub (design lock: Confirm and Save, Revision 2026-10-09,
 * items 2 to 4). It replaces the Data card, its donut and the green Vision banner.
 * Pure view-model: the component only draws what this returns.
 */
export const CONFIRM_IDENTITY_COPY = {
  found: "Fundet af Vision",
  reading: "Vision læser trøjen",
  unsure: "Vision er ikke sikker",
  visionOff: "Vision er slået fra",
  notFound: "Vision fandt ikke trøjen",
  emptyHeadline: "Vælg klub og sæson",
  emptyMono: "Klub · sæson · type",
  open: "Ret",
  choose: "Vælg",
  useSuggestion: "Brug forslaget",
  chooseMyself: "Vælg selv",
  seasonOr: "eller",
} as const;

export type IdentityBlockKind = "resolved" | "in-flight" | "low-confidence" | "empty";
export type IdentityPillTone = "primary" | "secondary";
export type IdentityBlockAction = "open-data" | "apply-suggestion" | "choose-myself";

export type IdentityBlockInput = {
  draft: CaptureJerseyDraft;
  /** Vision is available to this collector: signed in and quota left. */
  visionOn: boolean;
  /** An identity read is running for this jersey. */
  inFlight: boolean;
  /** A read has finished for this jersey (found or not). Callers use it to decide `inFlight`. */
  settled: boolean;
  /** Vision (not the collector) filled the facts. */
  filledByVision: boolean;
  /** Pending suggest-only result, shown as a question. */
  suggestion: VisionSuggestions | null;
  /** Only when the identity result carries one. The adapter returns none today. */
  seasonAlternative?: string | null;
};

export type IdentityFactKey = "club" | "season" | "type";

export type IdentityBlockModel = {
  kind: IdentityBlockKind;
  label: string | null;
  labelTone: "success" | "secondary";
  headline: string;
  headlineTone: "primary" | "muted";
  monoLine: string;
  /** In flight: one entry per fact, `null` value renders a placeholder bar. */
  facts: Array<{ key: IdentityFactKey; value: string | null }>;
  /** Trailing pill that opens the Data drill (resolved, empty). */
  pill: { label: string; tone: IdentityPillTone; action: IdentityBlockAction } | null;
  /** Low confidence: two pills under the guess. */
  actions: Array<{ label: string; tone: IdentityPillTone; action: IdentityBlockAction }>;
  accessibilityLabel: string;
};

const IDENTITY_FIELDS = ["clubId", "nationalTeamId", "seasonId", "type"] as const;

/** A suggestion is a pending question only when it carries identity facts. */
export function hasPendingLowConfidence(suggestion: VisionSuggestions | null | undefined): boolean {
  if (!suggestion) {
    return false;
  }
  return IDENTITY_FIELDS.some((field) => Boolean(suggestion[field]));
}

/**
 * Gem is on exactly when the Save rule holds (photo, club or national team, season, type,
 * size, condition). A pending low-confidence guess keeps it off until one pill is pressed.
 */
export function confirmSaveEnabled(input: {
  draft: CaptureJerseyDraft;
  lowConfidencePending: boolean;
}): boolean {
  return canSave(input.draft) && !input.lowConfidencePending;
}

function draftSide(draft: CaptureJerseyDraft): string | null {
  return draft.clubLabel ?? draft.nationalTeamLabel;
}

function draftType(draft: CaptureJerseyDraft): string | null {
  return draft.kitTypeSelected && draft.kitType ? KIT_TYPE_LABELS_DA[draft.kitType] : null;
}

function draftPlayer(draft: CaptureJerseyDraft): string | null {
  return draft.playerName.trim() ? draft.playerName.trim() : null;
}

function joinMono(parts: Array<string | null | undefined>): string {
  return parts.filter((part): part is string => Boolean(part)).join(" · ");
}

function speak(model: Omit<IdentityBlockModel, "accessibilityLabel">): string {
  const pills = [model.pill, ...model.actions].filter(Boolean).map((pill) => pill?.label);
  return [model.label, model.headline, model.monoLine, ...pills].filter(Boolean).join(". ");
}

export function resolveIdentityBlock(input: IdentityBlockInput): IdentityBlockModel {
  const { draft } = input;
  const side = draftSide(draft);
  const season = draft.seasonLabel;
  const type = draftType(draft);
  const player = draftPlayer(draft);

  let base: Omit<IdentityBlockModel, "accessibilityLabel">;

  if (input.inFlight) {
    base = {
      kind: "in-flight",
      label: CONFIRM_IDENTITY_COPY.reading,
      labelTone: "secondary",
      headline: side ?? "",
      headlineTone: "primary",
      monoLine: joinMono([season, type, player]),
      facts: [
        { key: "club", value: side },
        { key: "season", value: season },
        { key: "type", value: type },
      ],
      pill: null,
      actions: [],
    };
  } else if (hasPendingLowConfidence(input.suggestion) && input.suggestion) {
    const guess = input.suggestion;
    const guessSide = guess.clubLabel ?? guess.nationalTeamLabel ?? side;
    const guessSeason = guess.seasonLabel ?? season;
    const seasonText =
      guessSeason && input.seasonAlternative
        ? `${guessSeason} ${CONFIRM_IDENTITY_COPY.seasonOr} ${input.seasonAlternative}`
        : guessSeason;
    const guessType = guess.type ? KIT_TYPE_LABELS_DA[guess.type] : type;
    base = {
      kind: "low-confidence",
      label: CONFIRM_IDENTITY_COPY.unsure,
      labelTone: "secondary",
      headline: guessSide ? `${guessSide}?` : CONFIRM_IDENTITY_COPY.emptyHeadline,
      headlineTone: "muted",
      monoLine: joinMono([seasonText, guessType]),
      facts: [],
      pill: null,
      actions: [
        { label: CONFIRM_IDENTITY_COPY.useSuggestion, tone: "primary", action: "apply-suggestion" },
        { label: CONFIRM_IDENTITY_COPY.chooseMyself, tone: "secondary", action: "choose-myself" },
      ],
    };
  } else if (side) {
    base = {
      kind: "resolved",
      label: input.filledByVision ? CONFIRM_IDENTITY_COPY.found : null,
      labelTone: "success",
      headline: side,
      headlineTone: "primary",
      monoLine: joinMono([season, type, player]) || "Vælg sæson og type",
      facts: [],
      pill: { label: CONFIRM_IDENTITY_COPY.open, tone: "secondary", action: "open-data" },
      actions: [],
    };
  } else {
    base = {
      kind: "empty",
      label: input.visionOn ? CONFIRM_IDENTITY_COPY.notFound : CONFIRM_IDENTITY_COPY.visionOff,
      labelTone: "secondary",
      headline: CONFIRM_IDENTITY_COPY.emptyHeadline,
      headlineTone: "muted",
      monoLine: CONFIRM_IDENTITY_COPY.emptyMono,
      facts: [],
      pill: { label: CONFIRM_IDENTITY_COPY.choose, tone: "primary", action: "open-data" },
      actions: [],
    };
  }

  return { ...base, accessibilityLabel: speak(base) };
}
