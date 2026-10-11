import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  findMigrationPrefixCollisions,
  formatMigrationCollisionFeedback,
  migrationPrefix,
  missingBaseMigrations,
  nextMigrationPrefix,
} from "../lib/migration-prefix.mjs";

test("migrationPrefix reads the four-digit Drizzle prefix", () => {
  assert.equal(migrationPrefix("packages/db/migrations/0009_user_account_fields.sql"), "0009");
  assert.equal(migrationPrefix("packages/db/src/schema/index.ts"), null);
  assert.equal(migrationPrefix("packages/db/migrations/meta/_journal.json"), null);
});

test("findMigrationPrefixCollisions flags KIT-125 vs a landed 0009", () => {
  const collisions = findMigrationPrefixCollisions(
    ["packages/db/migrations/0009_user_account_fields.sql"],
    [
      "packages/db/migrations/0008_bidding_conversations.sql",
      "packages/db/migrations/0009_user_jersey_favorite.sql",
    ],
  );
  assert.deepEqual(collisions, [
    {
      prefix: "0009",
      added: "packages/db/migrations/0009_user_account_fields.sql",
      base: "packages/db/migrations/0009_user_jersey_favorite.sql",
    },
  ]);
});

test("findMigrationPrefixCollisions ignores an in-place edit of the same file", () => {
  const collisions = findMigrationPrefixCollisions(
    ["packages/db/migrations/0008_bidding_conversations.sql"],
    ["packages/db/migrations/0008_bidding_conversations.sql"],
  );
  assert.deepEqual(collisions, []);
});

test("nextMigrationPrefix is one past the lane max", () => {
  assert.equal(
    nextMigrationPrefix([
      "packages/db/migrations/0008_bidding_conversations.sql",
      "packages/db/migrations/0009_user_jersey_favorite.sql",
    ]),
    "0010",
  );
});

test("formatMigrationCollisionFeedback names the next prefix", () => {
  const lines = formatMigrationCollisionFeedback(
    [
      {
        prefix: "0009",
        added: "packages/db/migrations/0009_user_account_fields.sql",
        base: "packages/db/migrations/0009_user_jersey_favorite.sql",
      },
    ],
    "0010",
  );
  assert.match(lines.join("\n"), /0009_user_jersey_favorite/);
  assert.match(lines.join("\n"), /0010_/);
  assert.match(lines.join("\n"), /_journal\.json/);
  assert.match(lines.join("\n"), /commit/i);
});

test("missingBaseMigrations is true when added SQL has no lane listing", () => {
  assert.equal(
    missingBaseMigrations(["packages/db/migrations/0009_user_account_fields.sql"], []),
    true,
  );
  assert.equal(
    missingBaseMigrations(
      ["packages/db/migrations/0009_user_account_fields.sql"],
      ["packages/db/migrations/0008_bidding_conversations.sql"],
    ),
    false,
  );
  assert.equal(missingBaseMigrations([], []), false);
});

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "check-migration-prefixes.mjs");
const MIGRATIONS = "packages/db/migrations";

/** @param {string} dir @param {string[]} args */
function git(dir, args) {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8" });
}

/** A scratch repo: `development` holds the base migrations, `feature` is checked out on top. */
function repoWithBase(baseNames) {
  const dir = mkdtempSync(join(tmpdir(), "migration-prefix-"));
  git(dir, ["init", "-q", "-b", "development"]);
  git(dir, ["config", "user.email", "t@example.com"]);
  git(dir, ["config", "user.name", "t"]);
  mkdirSync(join(dir, MIGRATIONS), { recursive: true });
  writeFileSync(join(dir, "seed.txt"), "seed\n");
  for (const name of baseNames) {
    writeFileSync(join(dir, MIGRATIONS, name), `-- ${name}\n`);
  }
  git(dir, ["add", "."]);
  git(dir, ["commit", "-q", "-m", "base"]);
  git(dir, ["checkout", "-q", "-b", "feature"]);
  return dir;
}

function commitAdded(dir, name) {
  writeFileSync(join(dir, MIGRATIONS, name), "select 1;\n");
  git(dir, ["add", "."]);
  git(dir, ["commit", "-q", "-m", "change"]);
}

function runCli(dir) {
  return spawnSync("node", [SCRIPT], {
    cwd: dir,
    env: { ...process.env, BASE_REF: "development" },
    encoding: "utf8",
  });
}

test("CLI fails a non-ASCII migration whose prefix collides with the base", () => {
  const dir = repoWithBase(["9999_base.sql"]);
  commitAdded(dir, "9999_æble.sql");
  const result = runCli(dir);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /colliding Drizzle prefixes/);
  assert.match(result.stderr, /prefix 9999 collides/);
});

test("CLI passes a non-colliding non-ASCII migration", () => {
  const dir = repoWithBase(["9999_base.sql"]);
  commitAdded(dir, "9998_æble.sql");
  const result = runCli(dir);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /check-migration-prefixes: ok/);
});

test("CLI still fails an ASCII collision", () => {
  const dir = repoWithBase(["9999_base.sql"]);
  commitAdded(dir, "9999_other.sql");
  const result = runCli(dir);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /colliding Drizzle prefixes/);
});

test("CLI counts a renamed base migration as an added one (no rename detection)", () => {
  const dir = repoWithBase(["0009_a.sql"]);
  git(dir, ["mv", `${MIGRATIONS}/0009_a.sql`, `${MIGRATIONS}/0009_b.sql`]);
  git(dir, ["commit", "-q", "-m", "rename"]);
  const result = runCli(dir);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /prefix 0009 collides/);
});

test("CLI fails closed when the base holds no migration and the branch adds one", () => {
  const dir = repoWithBase([]);
  commitAdded(dir, "0001_first.sql");
  const result = runCli(dir);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /cannot read development migrations/);
});
