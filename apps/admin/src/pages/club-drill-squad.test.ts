import { describe, expect, it } from "vitest";
import { groupSquadPlayers } from "./club-drill-squad.js";

describe("groupSquadPlayers", () => {
  it("groups Goalkeepers, Defenders, Midfielders, Attackers and sorts by number inside each line", () => {
    const groups = groupSquadPlayers([
      {
        id: "550e8400-e29b-41d4-a716-446655440001",
        label: "Striker",
        squadNumber: 9,
        position: "Centre-Forward",
      },
      {
        id: "550e8400-e29b-41d4-a716-446655440002",
        label: "Keeper 16",
        squadNumber: 16,
        position: "Goalkeeper",
      },
      {
        id: "550e8400-e29b-41d4-a716-446655440003",
        label: "Centre-back",
        squadNumber: 4,
        position: "Centre-Back",
      },
      {
        id: "550e8400-e29b-41d4-a716-446655440004",
        label: "Keeper 1",
        squadNumber: 1,
        position: "Goalkeeper",
      },
      {
        id: "550e8400-e29b-41d4-a716-446655440005",
        label: "Eight",
        squadNumber: 8,
        position: "Central Midfield",
      },
    ]);

    expect(groups.map((group) => group.label)).toEqual([
      "Goalkeepers",
      "Defenders",
      "Midfielders",
      "Attackers",
    ]);
    expect(groups[0]?.rows.map((row) => row.squadNumber)).toEqual([1, 16]);
    expect(groups[1]?.rows.map((row) => row.squadNumber)).toEqual([4]);
  });
});
