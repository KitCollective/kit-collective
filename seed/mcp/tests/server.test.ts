import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { CliRunner } from "../src/run-cli.js";
import {
  APIFY_DESCRIPTION,
  createSeedMcpServer,
  FK_DESCRIPTION,
  SEED_MCP_SERVER_NAME,
  SEED_MCP_TOOL_NAMES,
} from "../src/server.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

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

describe("mcp.json.example", () => {
  it("registers kc_seed_mcp stdio with Seed env names and no Coolify tokens", () => {
    const example = JSON.parse(
      readFileSync(join(repoRoot, ".cursor/mcp.json.example"), "utf8"),
    ) as {
      mcpServers: Record<
        string,
        { command?: string; args?: string[]; env?: Record<string, string> }
      >;
    };

    const seedServer = example.mcpServers.kc_seed_mcp;
    expect(seedServer).toBeDefined();
    if (!seedServer) {
      throw new Error("kc_seed_mcp missing from mcp.json.example");
    }
    expect(seedServer.command).toBe("node");
    expect(seedServer.args).toEqual(["seed/mcp/dist/index.js"]);
    expect(example.mcpServers.seed).toBeUndefined();

    const envKeys = Object.keys(seedServer.env ?? {});
    expect(envKeys).toContain("SEED_PROXY_URL");
    expect(envKeys).toContain("SEED_REQUIRE_PROXY");
    expect(envKeys).toContain("FKAPI_BASE_URL");
    expect(envKeys).toContain("FKAPI_TOKEN");
    expect(envKeys).toContain("R2_BUCKET");
    expect(envKeys).not.toContain("COOLIFY_API_URL");
    expect(envKeys).not.toContain("COOLIFY_MCP_URL");
    expect(envKeys).not.toContain("COOLIFY_API_TOKEN");
  });
});
