import assert from "node:assert/strict";
import { test } from "node:test";
import { blockArgs, issueIdentifier, optionValue, swapLabelIds } from "../lib/linear-args.mjs";

test("an option value is the argument after its flag", () => {
  assert.equal(
    optionValue(["title", "--origin", "KIT-275", "--body-file", "b.md"], "--origin"),
    "KIT-275",
  );
  assert.equal(optionValue(["title", "--body-file", "b.md"], "--origin"), null);
});

test("a flag with no value, or followed by another flag, has no value", () => {
  assert.equal(optionValue(["--origin"], "--origin"), null);
  assert.equal(optionValue(["--origin", "--body-file", "b.md"], "--origin"), null);
});

test("an issue identifier is upper-cased and anything else is refused", () => {
  assert.equal(issueIdentifier("kit-275"), "KIT-275");
  assert.equal(issueIdentifier(" KIT-9 "), "KIT-9");
  assert.equal(issueIdentifier("275"), null);
  assert.equal(issueIdentifier("KIT-"), null);
  assert.equal(issueIdentifier(null), null);
});

test("block takes the blocked issue and --by blocker; self-blocks and malformed ids are refused", () => {
  assert.deepEqual(blockArgs(["kit-9", "--by", "KIT-3"]), { issue: "KIT-9", by: "KIT-3" });
  assert.equal(blockArgs(["KIT-9"]), null);
  assert.equal(blockArgs(["KIT-9", "--by", "KIT-9"]), null);
  assert.equal(blockArgs(["KIT-9", "--by", "3"]), null);
  assert.equal(blockArgs([]), null);
});

test("swapLabelIds replaces within one set, keeps the others, and refuses when from is absent", () => {
  assert.deepEqual(swapLabelIds(["a", "ready", "b"], "ready", "info"), ["a", "b", "info"]);
  assert.equal(swapLabelIds(["a", "b"], "ready", "info"), null);
  assert.deepEqual(swapLabelIds(["ready"], "ready", "ready"), ["ready"]);
});
