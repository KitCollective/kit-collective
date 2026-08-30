import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findMigrationPrefixCollisions,
  formatMigrationCollisionFeedback,
  migrationPrefix,
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
});
