import assert from "node:assert/strict";
import test from "node:test";
import {
  CATALOG_MARK_ENTITY_TYPES,
  HONOUR_SUBJECT_TYPES,
  PREFERRED_FOOT,
  VISION_EVAL_CLASSES,
} from "../dist/index.js";

test("PREFERRED_FOOT is left, right, both", () => {
  assert.deepEqual([...PREFERRED_FOOT], ["left", "right", "both"]);
});

test("HONOUR_SUBJECT_TYPES is club, national_team, player", () => {
  assert.deepEqual([...HONOUR_SUBJECT_TYPES], ["club", "national_team", "player"]);
});

test("CATALOG_MARK_ENTITY_TYPES is club, league, honour, national_team", () => {
  assert.deepEqual([...CATALOG_MARK_ENTITY_TYPES], ["club", "league", "honour", "national_team"]);
});

test("VISION_EVAL_CLASSES is accepted, alias, coverage, model, transport", () => {
  assert.deepEqual(
    [...VISION_EVAL_CLASSES],
    ["accepted", "alias", "coverage", "model", "transport"],
  );
});
