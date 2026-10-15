import type { CollectionJersey } from "@kit/api-contract";
import { JERSEY_CONDITION_LABELS_DA, JERSEY_SIZE_LABELS_DA, KIT_TYPE_LABELS_DA } from "@kit/domain";

/**
 * View logic for the own UserJersey detail (docs/design-system.md -> Own UserJersey detail).
 * Pure: no React, no react-native. The screen only renders what this module decides.
 */

export type BidRowTarget =
  | { kind: "thread"; conversationId: string }
  | { kind: "inbox"; jerseyId: string };

export type BidRowView = {
  /** Up to two bidder initials, the latest bidder first. */
  initials: string[];
  text: string;
  /** Time of the latest unanswered Bud; null when the API sent no timestamp. */
  time: string | null;
  target: BidRowTarget;
  accessibilityLabel: string;
  accessibilityHint: string;
};

export type PlayerRowView =
  | {
      kind: "player";
      name: string;
      /** Shirt number; null when the jersey has a player but no number. */
      number: number | null;
      caption: string;
      accessibilityLabel: string;
    }
  | { kind: "add"; title: string; accessibilityLabel: string };

export type FactRowView = {
  key: "type" | "size" | "condition" | "badge";
  label: string;
  value: string;
  /** An unset optional fact reads Tilføj in content.muted. */
  muted: boolean;
  accessibilityLabel: string;
};

export type SettingRowView = {
  label: string;
  helper: string;
  checked: boolean;
  disabled: boolean;
  accessibilityLabel: string;
};

export type JerseySettingsView = {
  bidding: SettingRowView;
  private: SettingRowView;
};

export type JerseyDetailView = {
  caption: string;
  title: string;
  season: string;
  bidRow: BidRowView | null;
  playerRow: PlayerRowView;
  factRows: FactRowView[];
};

export type JerseyDeleteConfirmCopy = {
  title: string;
  jerseyTitle: string;
  jerseyMeta: string;
  consequence: string;
  confirmLabel: string;
  keepLabel: string;
};

const ADD_LABEL = "Tilføj";
const PLAYER_CAPTION = "Spiller på ryggen";

export function jerseyTitle(jersey: CollectionJersey): string {
  return jersey.clubLabel ?? jersey.nationalTeamLabel ?? "";
}

/**
 * n is the jersey's ordinal by date added. The owner's list is ordered createdAt desc
 * (collection.service listJerseys) and the detail fetches it without a shortcut, so the oldest
 * jersey is nr. 1: n = list.length - index.
 */
function captionFor(jersey: CollectionJersey, list: readonly CollectionJersey[]): string {
  const type = KIT_TYPE_LABELS_DA[jersey.type];
  const index = list.findIndex((item) => item.id === jersey.id);
  if (index < 0) {
    return `Trøje · ${type}`;
  }
  return `Trøje nr. ${list.length - index} · ${type}`;
}

function bidRowFor(
  jersey: CollectionJersey,
  formatTime: (iso: string) => string,
): BidRowView | null {
  const count = jersey.unansweredBidCount ?? 0;
  if (count <= 0) {
    return null;
  }

  const conversationId = jersey.unansweredBidConversationId ?? null;
  const target: BidRowTarget = conversationId
    ? { kind: "thread", conversationId }
    : { kind: "inbox", jerseyId: jersey.id };
  const text = `${count} bud venter på svar`;
  const time = jersey.unansweredBidLatestAt ? formatTime(jersey.unansweredBidLatestAt) : null;

  return {
    initials: jersey.unansweredBidderInitials ?? [],
    text,
    time,
    target,
    accessibilityLabel: time ? `${text}, seneste ${time}` : text,
    accessibilityHint: conversationId ? "Åbner samtalen" : "Åbner Indbakke for denne trøje",
  };
}

function playerRowFor(jersey: CollectionJersey): PlayerRowView {
  const name = jersey.playerLabel;
  if (!name) {
    return {
      kind: "add",
      title: "Tilføj spiller",
      accessibilityLabel: `${PLAYER_CAPTION}, Tilføj spiller`,
    };
  }

  const parsed = jersey.playerNumber ? Number.parseInt(jersey.playerNumber, 10) : Number.NaN;
  const number = Number.isFinite(parsed) ? parsed : null;
  return {
    kind: "player",
    name,
    number,
    caption: PLAYER_CAPTION,
    accessibilityLabel:
      number === null
        ? `${PLAYER_CAPTION}, ${name}`
        : `${PLAYER_CAPTION}, ${name}, nummer ${number}`,
  };
}

function factRow(key: FactRowView["key"], label: string, value: string | null): FactRowView {
  const resolved = value ?? ADD_LABEL;
  return {
    key,
    label,
    value: resolved,
    muted: value === null,
    accessibilityLabel: `${label}, ${resolved}`,
  };
}

function factRowsFor(jersey: CollectionJersey): FactRowView[] {
  const badges = (jersey.patches ?? []).map((patch) => patch.label);
  return [
    factRow("type", "Type", KIT_TYPE_LABELS_DA[jersey.type]),
    factRow("size", "Størrelse", JERSEY_SIZE_LABELS_DA[jersey.size]),
    factRow("condition", "Stand", JERSEY_CONDITION_LABELS_DA[jersey.condition]),
    // No Note row in 1.0 (decided 2026-10-10).
    factRow("badge", "Badge", badges.length > 0 ? badges.join(", ") : null),
  ];
}

export function buildJerseyDetailView(input: {
  jersey: CollectionJersey;
  /** The owner's full list, createdAt desc. */
  list: readonly CollectionJersey[];
  formatTime: (iso: string) => string;
}): JerseyDetailView {
  const { jersey, list, formatTime } = input;
  return {
    caption: captionFor(jersey, list),
    title: jerseyTitle(jersey),
    season: jersey.seasonLabel,
    bidRow: bidRowFor(jersey, formatTime),
    playerRow: playerRowFor(jersey),
    factRows: factRowsFor(jersey),
  };
}

const BIDDING_HELPER = "Andre samlere kan finde trøjen under Søg og sende bud.";
const BIDDING_HELPER_PRIVATE = "Slået fra, fordi trøjen er privat.";
const PRIVATE_HELPER = "Skjuler trøjen fra søgning og andre samlere.";

/** Privat on turns bids off and disables the bidding switch; the helper says why. */
export function jerseySettingsView(input: {
  biddingEnabled: boolean;
  isPrivate: boolean;
  savingBidding: boolean;
  savingPrivate: boolean;
}): JerseySettingsView {
  const biddingHelper = input.isPrivate ? BIDDING_HELPER_PRIVATE : BIDDING_HELPER;
  return {
    bidding: {
      label: "Åben for bud",
      helper: biddingHelper,
      checked: input.biddingEnabled && !input.isPrivate,
      disabled: input.savingBidding || input.isPrivate,
      accessibilityLabel: `Åben for bud, ${biddingHelper}`,
    },
    private: {
      label: "Privat",
      helper: PRIVATE_HELPER,
      checked: input.isPrivate,
      disabled: input.savingPrivate,
      accessibilityLabel: `Privat, ${PRIVATE_HELPER}`,
    },
  };
}

/**
 * Delete confirmation. CONTEXT.md -> Conversation: deleting a UserJersey does not delete the
 * Conversation; pending Buds are declined and the threads stay (KIT-295). The copy never says
 * conversations or bids are deleted.
 */
export function jerseyDeleteConfirmCopy(jersey: CollectionJersey): JerseyDeleteConfirmCopy {
  return {
    title: "Slet trøjen?",
    jerseyTitle: jerseyTitle(jersey),
    jerseyMeta: `${jersey.seasonLabel} · ${KIT_TYPE_LABELS_DA[jersey.type]}`,
    consequence:
      "Trøjen og dens fotos fjernes fra din samling. Åbne bud på den afvises, men samtalerne bliver liggende i din Indbakke.",
    confirmLabel: "Slet trøjen",
    keepLabel: "Behold",
  };
}

export function jerseyPhotoCountLabel(index: number, total: number): string {
  return `${index + 1}/${total}`;
}
