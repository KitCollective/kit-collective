import assert from "node:assert/strict";
import test from "node:test";
import { HONOUR_SUBJECT_TYPES, PREFERRED_FOOT } from "../dist/index.js";

test("PREFERRED_FOOT is left, right, both", () => {
  assert.deepEqual([...PREFERRED_FOOT], ["left", "right", "both"]);
});

test("HONOUR_SUBJECT_TYPES is club, national_team, player", () => {
  assert.deepEqual([...HONOUR_SUBJECT_TYPES], ["club", "national_team", "player"]);
});
