import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SEED_TOOL_DEFINITIONS, SEED_TOOL_LANES } from "./tools.ts";

describe("Seed MCP tool descriptions", () => {
  it("exposes seed_apify and seed_fk", () => {
    assert.deepEqual(
      SEED_TOOL_DEFINITIONS.map((tool) => tool.name),
      ["seed_apify", "seed_fk"],
    );
  });

  it("explains 0001, Apify-before-FK, and lane rules on both tools", () => {
    for (const tool of SEED_TOOL_DEFINITIONS) {
      assert.match(tool.description, /0001/);
      assert.match(tool.description, /first season/i);
      assert.match(tool.description, /Apify/i);
      assert.match(tool.description, /FK/i);
      assert.match(tool.description, /development/i);
      assert.match(tool.description, /staging/i);
      assert.match(tool.description, /production/i);
    }
  });

  it("does not accept production as a tool lane", () => {
    assert.deepEqual(SEED_TOOL_LANES, ["development", "staging"]);
    assert.equal(SEED_TOOL_LANES.includes("production"), false);
  });
});
