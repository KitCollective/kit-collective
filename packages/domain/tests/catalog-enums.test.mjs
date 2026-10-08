import assert from "node:assert/strict";
import test from "node:test";
import {
  CATALOG_MARK_ENTITY_TYPES,
  HONOUR_SUBJECT_TYPES,
  PREFERRED_FOOT,
  VISION_EVAL_CLASSES,
  VISION_IMPROVE_ENTITY_TYPES,
  VISION_IMPROVE_FIELDS,
  VISION_IMPROVE_KINDS,
  VISION_IMPROVE_STATUSES,
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

test("VISION_IMPROVE_KINDS is alias, seed, prompt", () => {
  assert.deepEqual([...VISION_IMPROVE_KINDS], ["alias", "seed", "prompt"]);
});

test("VISION_IMPROVE_STATUSES is proposed, applied, dismissed, noted", () => {
  assert.deepEqual([...VISION_IMPROVE_STATUSES], ["proposed", "applied", "dismissed", "noted"]);
});

test("VISION_IMPROVE_ENTITY_TYPES is club through patch", () => {
  assert.deepEqual(
    [...VISION_IMPROVE_ENTITY_TYPES],
    ["club", "national_team", "season", "kit", "player", "patch"],
  );
});

test("VISION_IMPROVE_FIELDS matches Vision eval field-hit keys", () => {
  assert.deepEqual(
    [...VISION_IMPROVE_FIELDS],
    ["side", "season", "type", "catalogKitId", "player", "patch"],
  );
});
