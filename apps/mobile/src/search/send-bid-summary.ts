import type { CollectionPeerJersey } from "@kit/api-contract";
import { JERSEY_CONDITION_LABELS_DA, JERSEY_SIZE_LABELS_DA, KIT_TYPE_LABELS_DA } from "@kit/domain";

export type SendBidSummary = {
  /** Club and season, `label` 16 / 600. */
  title: string;
  /** Type · size · condition, `mono`. */
  facts: string;
  /** Player · owner Handle, `caption`; the owner Handle alone without a player. */
  byline: string;
};

/** Jersey summary of Send bud (docs/design-system.md → Send bid → 2). Pure. */
export function buildSendBidSummary(
  jersey: Pick<
    CollectionPeerJersey,
    "clubLabel" | "seasonLabel" | "type" | "size" | "condition" | "playerLabel" | "ownerHandle"
  >,
): SendBidSummary {
  return {
    title: `${jersey.clubLabel} ${jersey.seasonLabel}`,
    facts: [
      KIT_TYPE_LABELS_DA[jersey.type],
      JERSEY_SIZE_LABELS_DA[jersey.size],
      JERSEY_CONDITION_LABELS_DA[jersey.condition],
    ].join(" · "),
    byline: jersey.playerLabel
      ? `${jersey.playerLabel} · ${jersey.ownerHandle}`
      : jersey.ownerHandle,
  };
}
