import { describe, expect, it, vi } from "vitest";
import type { CliRunner } from "../src/run-cli.js";
import {
  APIFY_DESCRIPTION,
  createSeedMcpServer,
  FK_DESCRIPTION,
  SEED_MCP_SERVER_NAME,
  SEED_MCP_TOOL_NAMES,
} from "../src/server.js";

describe("kc_seed_mcp catalog", () => {
  it("registers as kc_seed_mcp with seed_apify and seed_fk only", () => {
    expect(SEED_MCP_SERVER_NAME).toBe("kc_seed_mcp");
    expect(SEED_MCP_TOOL_NAMES).toEqual(["seed_apify", "seed_fk"]);
    expect(createSeedMcpServer(vi.fn<CliRunner>())).toBeDefined();
  });

  it("tool descriptions say Coolify MCP is not for Seed scope args", () => {
    for (const description of [APIFY_DESCRIPTION, FK_DESCRIPTION]) {
      expect(description).toMatch(/Coolify MCP is host-only/i);
      expect(description).toMatch(/fromSeason/i);
      expect(description).toMatch(/toSeason/i);
      expect(description).toMatch(/club \+ season/i);
    }
  });
});
