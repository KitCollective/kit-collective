import assert from "node:assert/strict";
import { test } from "node:test";
import { issueIdentifier, optionValue } from "../lib/linear-args.mjs";

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
