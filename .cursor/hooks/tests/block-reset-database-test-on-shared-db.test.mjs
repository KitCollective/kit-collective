import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HOOK = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "block-reset-database-test-on-shared-db.sh",
);

const LANE_URL = "postgresql://kitcollective:secret@62.238.53.158:5432/kitcollective";
const TEST_URL = "postgresql://kit:kit@localhost:5432/kit_test";

function runHook(command, extraEnv = {}) {
  const result = spawnSync("bash", [HOOK], {
    input: JSON.stringify({ command }),
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      ...extraEnv,
    },
  });
  let body;
  try {
    body = JSON.parse(result.stdout || "{}");
  } catch {
    body = { permission: "invalid", stdout: result.stdout };
  }
  return { status: result.status, permission: body.permission, message: body.user_message };
}

test("allows non-test commands while DATABASE_URL is the lane", () => {
  const result = runHook("pnpm --filter @kit/db typecheck", { DATABASE_URL: LANE_URL });
  assert.equal(result.permission, "allow");
  assert.equal(result.status, 0);
});

test("allows tests when DATABASE_URL is unset", () => {
  const result = runHook("pnpm test");
  assert.equal(result.permission, "allow");
});

test("allows tests when DATABASE_URL is localhost kit_test", () => {
  const result = runHook("pnpm test", { DATABASE_URL: TEST_URL });
  assert.equal(result.permission, "allow");
});

test("allows a package that does not reset Postgres", () => {
  const result = runHook("pnpm --filter @kit/mobile test", { DATABASE_URL: LANE_URL });
  assert.equal(result.permission, "allow");
});

test("denies unfiltered pnpm test while DATABASE_URL is the lane", () => {
  const result = runHook("pnpm test", { DATABASE_URL: LANE_URL });
  assert.equal(result.permission, "deny");
  assert.equal(result.status, 2);
  assert.match(result.message, /SEED_FKAPI_TEST_DATABASE_URL/);
});

test("denies turbo run test while DATABASE_URL is the lane", () => {
  const result = runHook("turbo run test --concurrency=1", { DATABASE_URL: LANE_URL });
  assert.equal(result.permission, "deny");
});

test("denies @kit/seed-fkapi tests without a dedicated test URL", () => {
  const result = runHook("pnpm --filter @kit/seed-fkapi test", { DATABASE_URL: LANE_URL });
  assert.equal(result.permission, "deny");
  assert.match(result.message, /SEED_FKAPI_TEST_DATABASE_URL/);
});

test("denies @kit/db tests without KIT_DB_TEST_DATABASE_URL", () => {
  const result = runHook("pnpm --filter @kit/db test", { DATABASE_URL: LANE_URL });
  assert.equal(result.permission, "deny");
  assert.match(result.message, /KIT_DB_TEST_DATABASE_URL/);
});

test("allows @kit/db tests when KIT_DB_TEST_DATABASE_URL is disposable", () => {
  const result = runHook("pnpm --filter @kit/db test", {
    DATABASE_URL: LANE_URL,
    KIT_DB_TEST_DATABASE_URL: TEST_URL,
  });
  assert.equal(result.permission, "allow");
});

test("allows unfiltered pnpm test when every dedicated test URL is disposable", () => {
  const result = runHook("pnpm test", {
    DATABASE_URL: LANE_URL,
    SEED_FKAPI_TEST_DATABASE_URL: TEST_URL,
    SEED_APIFY_TEST_DATABASE_URL: TEST_URL,
    KIT_DB_TEST_DATABASE_URL: TEST_URL,
    API_TEST_DATABASE_URL: "postgresql://kit:kit@localhost:5432/kit_api_test",
  });
  assert.equal(result.permission, "allow");
});
