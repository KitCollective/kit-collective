import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SEED_MCP_HTTP_PATH } from "../src/http.js";
import { SEED_MCP_TOKEN_ENV } from "../src/http-auth.js";
import { SEED_MCP_SERVER_NAME } from "../src/server.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function readRepo(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

describe("Coolify Seed MCP host", () => {
  it("is a 24/7 HTTP service on /mcp, not a one-shot seed job", () => {
    const compose = readRepo("seed/coolify/docker-compose.mcp.yml");
    const jobs = [
      readRepo("seed/coolify/docker-compose.apify-job.yml"),
      readRepo("seed/coolify/docker-compose.fkapi-job.yml"),
    ];

    expect(SEED_MCP_HTTP_PATH).toBe("/mcp");
    expect(compose).toMatch(/restart:\s*unless-stopped/);
    expect(compose).toMatch(/seed\/mcp\/dist\/http\.js/);
    expect(compose).toMatch(/["']8787["']|PORT:\s*["']?8787/);
    expect(compose).not.toMatch(/seed\/mcp\/dist\/index\.js/);
    expect(compose).not.toMatch(/seed_apify|seed_fk/);

    for (const job of jobs) {
      expect(job).toMatch(/restart:\s*"no"/);
      expect(job).not.toMatch(/seed\/mcp\/dist\/http\.js/);
    }
  });

  it("requires SEED_MCP_TOKEN in Coolify app env and omits every COOLIFY_* name from the process", () => {
    const compose = readRepo("seed/coolify/docker-compose.mcp.yml");
    expect(SEED_MCP_TOKEN_ENV).toBe("SEED_MCP_TOKEN");
    expect(compose).toMatch(/SEED_MCP_TOKEN/);
    expect(compose).toMatch(/SEED_FK_FETCH:\s*\$\{SEED_FK_FETCH:-fixture\}/);
    expect(compose).toMatch(/DATABASE_URL/);
    expect(compose).toMatch(/SEED_PROXY_URL/);
    expect(compose).toMatch(/SEED_REQUIRE_PROXY/);
    expect(compose).not.toMatch(/COOLIFY_/);
    expect(compose).not.toMatch(/COOLIFY_MCP_URL|COOLIFY_API_TOKEN|COOLIFY_API_URL/);
  });

  it("default Dockerfile command serves HTTP, while stdio remains the predecessor binary", () => {
    const dockerfile = readRepo("seed/coolify/Dockerfile");
    const remote = readRepo("seed/coolify/Dockerfile.remote");
    const pkg = JSON.parse(readRepo("seed/mcp/package.json")) as {
      bin: Record<string, string>;
      scripts: Record<string, string>;
    };

    expect(SEED_MCP_SERVER_NAME).toBe("kc_seed_mcp");
    expect(pkg.bin["seed-mcp"]).toBe("./dist/index.js");
    expect(pkg.bin["seed-mcp-http"]).toBe("./dist/http.js");
    expect(pkg.scripts.start).toBe("node dist/index.js");
    expect(pkg.scripts["start:http"]).toBe("node dist/http.js");
    expect(dockerfile).toMatch(/CMD\s*\[["']node["']\s*,\s*["']seed\/mcp\/dist\/http\.js["']\]/);
    expect(remote).toMatch(/CMD\s*\[["']node["']\s*,\s*["']seed\/mcp\/dist\/http\.js["']\]/);
    const fkapi = dockerfile.indexOf("@kit/seed-fkapi build");
    const apify = dockerfile.indexOf("@kit/seed-apify build");
    expect(fkapi).toBeGreaterThan(-1);
    expect(apify).toBeGreaterThan(-1);
    expect(fkapi).toBeLessThan(apify);
    expect(remote.indexOf("@kit/seed-fkapi build")).toBeLessThan(
      remote.indexOf("@kit/seed-apify build"),
    );
  });

  it("wire script defaults to development and refuses production", () => {
    const wire = readRepo("seed/coolify/wire-mcp.sh");
    expect(wire).toMatch(/SEED_LANE:-development/);
    expect(wire).toMatch(/production/);
    expect(wire).toMatch(/SEED_MCP_TOKEN/);
    expect(wire).toMatch(/SEED_FK_FETCH/);
    expect(wire).toMatch(/base_directory: "\/"/);
    expect(wire).toMatch(/Dockerfile\.remote/);
    expect(wire).not.toMatch(/COOLIFY_API_TOKEN.*SEED_MCP_TOKEN/);
  });
});

describe("Coolify Seed MCP GitHub workflow", () => {
  it("wires the development lane only and never offers production", () => {
    const workflow = readRepo(".github/workflows/wire-coolify-seed-mcp.yml");
    expect(workflow).toMatch(/environment:\s*development/);
    expect(workflow).toMatch(/seed\/coolify\/wire-mcp\.sh/);
    expect(workflow).not.toMatch(/production/);
  });
});
