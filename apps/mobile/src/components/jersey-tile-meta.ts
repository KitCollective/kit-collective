/** Pure meta-line formatter for JerseyTile — testable without react-native. */
export function jerseyTileMetaLine(seasonLabel: string, typeLabel: string): string {
  return `${seasonLabel} · ${typeLabel}`;
}

/** The one badge a Samling tile may carry (docs/design-system.md → Collection grid). */
export type JerseyTileBadge = { kind: "bids"; count: number } | { kind: "lock" };

/**
 * Samling caption (Revision 2026-10-10): a lead line with the size trailing, then one
 * secondary line. `leadRole` picks the type role of the lead: the club in `heading-sm`, or
 * the season in `mono` when the tile sits under a club heading.
 */
export type JerseyTileCaption = {
  lead: string;
  leadRole: "club" | "season";
  trailing?: string;
  secondary: string;
};

/** Text on the pill, and the name a screen reader gets for the badge. */
export function jerseyTileBadgeLabel(badge: JerseyTileBadge): string {
  return badge.kind === "bids" ? `${badge.count} bud` : "Privat";
}

/** Accessible name: the club is always in it, even when a heading carries it visually. */
export function jerseyTileAccessibilityLabel(input: {
  clubLabel: string;
  seasonLabel: string;
  typeLabel: string;
  caption?: JerseyTileCaption;
  badge?: JerseyTileBadge | null;
}): string {
  const { clubLabel, seasonLabel, typeLabel, caption, badge } = input;
  const parts = caption
    ? caption.leadRole === "club"
      ? [clubLabel, caption.trailing, caption.secondary]
      : [clubLabel, caption.lead, caption.trailing, caption.secondary]
    : [clubLabel, jerseyTileMetaLine(seasonLabel, typeLabel)];
  if (badge) {
    parts.push(jerseyTileBadgeLabel(badge));
  }
  return parts.filter((part): part is string => Boolean(part)).join(", ");
}
