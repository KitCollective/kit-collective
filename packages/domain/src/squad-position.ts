/** Kader line buckets — Transfermarkt squad tables, English chrome. */
export const SQUAD_POSITION_GROUPS = [
  "goalkeeper",
  "defender",
  "midfielder",
  "attacker",
  "unknown",
] as const;

export type SquadPositionGroup = (typeof SQUAD_POSITION_GROUPS)[number];

const GROUP_RANK: Record<SquadPositionGroup, number> = {
  goalkeeper: 0,
  defender: 1,
  midfielder: 2,
  attacker: 3,
  unknown: 4,
};

/**
 * Map a stored kader / profile position string onto a squad line.
 * Specific labels stay as stored (`Centre-Back`); this only decides sort order.
 */
export function squadPositionGroup(position: string | null | undefined): SquadPositionGroup {
  const value = position?.trim().toLowerCase() ?? "";
  if (value.length === 0) {
    return "unknown";
  }
  if (value.includes("goalkeeper") || value === "gk") {
    return "goalkeeper";
  }
  if (value.includes("midfield")) {
    return "midfielder";
  }
  if (
    value.includes("back") ||
    value.includes("defence") ||
    value.includes("defense") ||
    value.includes("defender") ||
    value.includes("sweeper")
  ) {
    return "defender";
  }
  if (
    value.includes("forward") ||
    value.includes("striker") ||
    value.includes("winger") ||
    value.includes("attack")
  ) {
    return "attacker";
  }
  return "unknown";
}

export function compareSquadOrder(
  left: { position?: string | null; squadNumber: number | null },
  right: { position?: string | null; squadNumber: number | null },
): number {
  const groupDelta =
    GROUP_RANK[squadPositionGroup(left.position)] - GROUP_RANK[squadPositionGroup(right.position)];
  if (groupDelta !== 0) {
    return groupDelta;
  }
  const leftNumber = left.squadNumber ?? Number.POSITIVE_INFINITY;
  const rightNumber = right.squadNumber ?? Number.POSITIVE_INFINITY;
  if (leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }
  return 0;
}
