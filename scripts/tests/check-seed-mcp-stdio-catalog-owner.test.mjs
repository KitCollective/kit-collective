import assert from "node:assert/strict";
import { test } from "node:test";
import {
  countStdioCatalogAsserts,
  findSeedMcpStdioCatalogOwnerViolations,
} from "../check-seed-mcp-stdio-catalog-owner.mjs";

const OWNER = "seed/mcp/tests/server.test.ts";
const HTTP = "seed/mcp/tests/http.test.ts";
const OWNER_ONCE = `
  it("registers as kc_seed_mcp with seed_apify and seed_fk only", () => {
    expect(SEED_MCP_TOOL_NAMES).toEqual(["seed_apify", "seed_fk"]);
  });
`;
const HTTP_SPLIT = `
  it("HTTP catalog is not the stdio debug tools", () => {
    expect(SEED_MCP_HTTP_TOOL_NAMES).not.toContain("seed_apify");
    expect(SEED_MCP_HTTP_TOOL_NAMES).not.toContain("seed_fk");
  });
`;
const HTTP_REASSERT = `
  it("stdio debug binary keeps seed_apify and seed_fk and is not the HTTP catalog", () => {
    expect(SEED_MCP_TOOL_NAMES).toEqual(["seed_apify", "seed_fk"]);
    expect(SEED_MCP_HTTP_TOOL_NAMES).not.toEqual(SEED_MCP_TOOL_NAMES);
  });
`;

test("countStdioCatalogAsserts finds the owned tuple", () => {
  assert.equal(countStdioCatalogAsserts(OWNER_ONCE), 1);
  assert.equal(countStdioCatalogAsserts(HTTP_SPLIT), 0);
  assert.equal(countStdioCatalogAsserts(HTTP_REASSERT), 1);
});

test("passes when server.test.ts owns the catalog once and HTTP does not re-assert", () => {
  const violations = findSeedMcpStdioCatalogOwnerViolations({
    testFileContents: {
      [OWNER]: OWNER_ONCE,
      [HTTP]: HTTP_SPLIT,
    },
  });
  assert.deepEqual(violations, []);
});

test("fails when HTTP tests re-assert the stdio catalog", () => {
  const violations = findSeedMcpStdioCatalogOwnerViolations({
    testFileContents: {
      [OWNER]: OWNER_ONCE,
      [HTTP]: HTTP_REASSERT,
    },
  });
  assert.ok(violations.some((line) => line.includes(HTTP)));
});

test("fails when the owner file duplicates the catalog assert", () => {
  const violations = findSeedMcpStdioCatalogOwnerViolations({
    testFileContents: {
      [OWNER]: `${OWNER_ONCE}\n${OWNER_ONCE}`,
      [HTTP]: HTTP_SPLIT,
    },
  });
  assert.ok(violations.some((line) => line.includes(OWNER) && line.includes("exactly once")));
});

test("fails when the owner file drops the catalog pin", () => {
  const violations = findSeedMcpStdioCatalogOwnerViolations({
    testFileContents: {
      [OWNER]: HTTP_SPLIT,
      [HTTP]: HTTP_SPLIT,
    },
  });
  assert.ok(violations.some((line) => line.includes(OWNER) && line.includes("exactly once")));
});
