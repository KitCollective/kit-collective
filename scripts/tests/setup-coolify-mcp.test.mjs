import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoScript = join(
  dirname(fileURLToPath(import.meta.url)),
  "../setup-coolify-mcp.sh",
);

const COOLIFY_URL = "https://coolify.example.test/mcp";
const COOLIFY_TOKEN = "fixture-coolify-token";

const SEED_PROXY_KEYS = ["SEED_PROXY_URL", "SEED_REQUIRE_PROXY"];
const FK_KEYS = ["FKAPI_BASE_URL", "FKAPI_TOKEN"];
const LANE_R2_KEYS = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_ENDPOINT",
];
const COOLIFY_TOKEN_KEYS = [
  "COOLIFY_API_URL",
  "COOLIFY_API_TOKEN",
  "COOLIFY_MCP_URL",
];

async function generateMcpJson() {
  const root = await mkdtemp(join(tmpdir(), "kit-78-mcp-"));
  try {
    await mkdir(join(root, "scripts"), { recursive: true });
    await copyFile(repoScript, join(root, "scripts/setup-coolify-mcp.sh"));
    await execFileAsync("bash", [join(root, "scripts/setup-coolify-mcp.sh")], {
      cwd: root,
      env: {
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        HOME: process.env.HOME ?? tmpdir(),
        COOLIFY_MCP_URL: COOLIFY_URL,
        COOLIFY_API_TOKEN: COOLIFY_TOKEN,
      },
    });
    return JSON.parse(await readFile(join(root, ".cursor/mcp.json"), "utf8"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("setup-coolify-mcp writes kc_seed_mcp catalog with Seed-only env and a separate coolify server", async () => {
  const catalog = await generateMcpJson();
  const servers = catalog.mcpServers;

  assert.ok(servers.kc_seed_mcp, "expected server id kc_seed_mcp");
  assert.equal(servers.seed, undefined);
  assert.ok(servers.coolify, "expected a separate coolify server");
  assert.equal(servers.coolify.url, COOLIFY_URL);

  const seedEnv = servers.kc_seed_mcp.env ?? {};
  const seedKeys = Object.keys(seedEnv);

  for (const key of [...SEED_PROXY_KEYS, ...FK_KEYS, ...LANE_R2_KEYS]) {
    assert.ok(seedKeys.includes(key), `expected Seed env name ${key}`);
  }
  for (const key of COOLIFY_TOKEN_KEYS) {
    assert.equal(
      seedKeys.includes(key),
      false,
      `Coolify token key ${key} must not appear on kc_seed_mcp`,
    );
  }
  for (const value of Object.values(seedEnv)) {
    assert.equal(
      String(value).includes(COOLIFY_TOKEN),
      false,
      "kc_seed_mcp env must not carry the Coolify token value",
    );
  }
});
