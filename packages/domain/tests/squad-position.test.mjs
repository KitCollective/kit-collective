import assert from "node:assert/strict";
import test from "node:test";
import { compareSquadOrder, squadPositionGroup } from "../dist/index.js";

test("squadPositionGroup maps Transfermarkt kader labels onto lines", () => {
  assert.equal(squadPositionGroup("Goalkeeper"), "goalkeeper");
  assert.equal(squadPositionGroup("Centre-Back"), "defender");
  assert.equal(squadPositionGroup("Left-Back"), "defender");
  assert.equal(squadPositionGroup("Defensive Midfield"), "midfielder");
  assert.equal(squadPositionGroup("Attacking Midfield"), "midfielder");
  assert.equal(squadPositionGroup("Left Winger"), "attacker");
  assert.equal(squadPositionGroup("Centre-Forward"), "attacker");
  assert.equal(squadPositionGroup(null), "unknown");
});

test("compareSquadOrder is Goalkeepers, Defenders, Midfielders, Attackers, then number", () => {
  const rows = [
    { position: "Centre-Forward", squadNumber: 9 },
    { position: "Goalkeeper", squadNumber: 16 },
    { position: "Centre-Back", squadNumber: 2 },
    { position: "Goalkeeper", squadNumber: 1 },
    { position: "Central Midfield", squadNumber: 8 },
    { position: "Centre-Back", squadNumber: 4 },
  ];
  const ordered = [...rows].sort(compareSquadOrder);
  assert.deepEqual(
    ordered.map((row) => `${row.squadNumber}:${row.position}`),
    [
      "1:Goalkeeper",
      "16:Goalkeeper",
      "2:Centre-Back",
      "4:Centre-Back",
      "8:Central Midfield",
      "9:Centre-Forward",
    ],
  );
});
