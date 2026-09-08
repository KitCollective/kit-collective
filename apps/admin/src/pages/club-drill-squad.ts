import type { AdminSquadPlayer } from "@kit/api-contract";
import {
  compareSquadOrder,
  type SquadPositionGroup,
  squadPositionGroup,
} from "@kit/domain";

export const SQUAD_GROUP_LABELS: Record<SquadPositionGroup, string> = {
  goalkeeper: "Goalkeepers",
  defender: "Defenders",
  midfielder: "Midfielders",
  attacker: "Attackers",
  unknown: "Other",
};

export function groupSquadPlayers(players: AdminSquadPlayer[]): Array<{
  group: SquadPositionGroup;
  label: string;
  rows: AdminSquadPlayer[];
}> {
  const groups: Array<{
    group: SquadPositionGroup;
    label: string;
    rows: AdminSquadPlayer[];
  }> = [];
  for (const player of [...players].sort(compareSquadOrder)) {
    const group = squadPositionGroup(player.position);
    const last = groups.at(-1);
    if (last?.group === group) {
      last.rows.push(player);
    } else {
      groups.push({ group, label: SQUAD_GROUP_LABELS[group], rows: [player] });
    }
  }
  return groups;
}
