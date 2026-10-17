import type { CollectionPeerJersey } from "@kit/api-contract";
import { JERSEY_CONDITION_LABELS_DA, JERSEY_SIZE_LABELS_DA, KIT_TYPE_LABELS_DA } from "@kit/domain";
import type { FactRowView, PlayerRowView } from "@/jersey-detail/jersey-detail-view-model";

/**
 * View logic for the foreign UserJersey detail (docs/design-system.md → Foreign UserJersey
 * detail). Pure: no React, no react-native. The screen only renders what this module decides.
 */

const OPEN_FOR_BID_SUFFIX = " · Åben for bud";
const PLAYER_CAPTION = "Spiller på ryggen";
const OWNER_SECTION_CAPTION = "Ejer";

export type ForeignPlayerRowView = Extract<PlayerRowView, { kind: "player" }>;

export type ForeignOwnerRowView = {
  /** The `caption` over the row. */
  sectionCaption: string;
  handle: string;
  /** City per Vis by · n trøjer, or n trøjer without a city. */
  caption: string;
  /** Peer Profil of the owner. */
  href: `/(tabs)/search/peer/${string}`;
  accessibilityLabel: string;
};

export type ForeignJerseyView = {
  /** The type, plus · Åben for bud when the jersey is. */
  caption: string;
  title: string;
  season: string;
  /** Null without a player. */
  playerRow: ForeignPlayerRowView | null;
  /** Størrelse, Stand and Badge; an unset fact is left out. */
  factRows: FactRowView[];
  owner: ForeignOwnerRowView;
};

function jerseyCountLabel(count: number): string {
  return count === 1 ? "1 trøje" : `${count} trøjer`;
}

function playerRowFor(jersey: CollectionPeerJersey): ForeignPlayerRowView | null {
  const name = jersey.playerLabel;
  if (!name) {
    return null;
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

function factRow(key: FactRowView["key"], label: string, value: string): FactRowView {
  return { key, label, value, muted: false, accessibilityLabel: `${label}, ${value}` };
}

function factRowsFor(jersey: CollectionPeerJersey): FactRowView[] {
  const rows: FactRowView[] = [];
  const size = JERSEY_SIZE_LABELS_DA[jersey.size];
  if (size) {
    rows.push(factRow("size", "Størrelse", size));
  }
  const condition = JERSEY_CONDITION_LABELS_DA[jersey.condition];
  if (condition) {
    rows.push(factRow("condition", "Stand", condition));
  }
  if (jersey.patches.length > 0) {
    rows.push(factRow("badge", "Badge", jersey.patches.map((patch) => patch.label).join(", ")));
  }
  return rows;
}

function ownerRowFor(jersey: CollectionPeerJersey): ForeignOwnerRowView {
  const count = jerseyCountLabel(jersey.ownerJerseyCount);
  const caption = jersey.ownerCity ? `${jersey.ownerCity} · ${count}` : count;
  return {
    sectionCaption: OWNER_SECTION_CAPTION,
    handle: jersey.ownerHandle,
    caption,
    href: `/(tabs)/search/peer/${jersey.ownerHandle}`,
    accessibilityLabel: `${OWNER_SECTION_CAPTION}, ${jersey.ownerHandle}, ${caption}`,
  };
}

export function buildForeignJerseyView(jersey: CollectionPeerJersey): ForeignJerseyView {
  const type = KIT_TYPE_LABELS_DA[jersey.type];
  return {
    caption: jersey.biddingEnabled ? `${type}${OPEN_FOR_BID_SUFFIX}` : type,
    title: jersey.clubLabel,
    season: jersey.seasonLabel,
    playerRow: playerRowFor(jersey),
    factRows: factRowsFor(jersey),
    owner: ownerRowFor(jersey),
  };
}
