import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { findDanishCodeIdentifiers } from "../lib/danish-code-identifiers.mjs";

const HOOK = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "block-danish-code-identifiers.sh",
);

/**
 * @param {string} command
 */
function runHook(command) {
  const result = spawnSync("bash", [HOOK], {
    input: JSON.stringify({ command }),
    encoding: "utf8",
  });
  let body;
  try {
    body = JSON.parse(result.stdout || "{}");
  } catch {
    body = { permission: "invalid", stdout: result.stdout };
  }
  return { status: result.status, permission: body.permission, message: body.user_message };
}

test("findDanishCodeIdentifiers flags added Danish function names", () => {
  const hits = findDanishCodeIdentifiers(
    "+export default function KontoindstillingerScreen() {\n+  return null;\n+}",
  );
  assert.equal(hits.length, 1);
  assert.equal(hits[0].name, "KontoindstillingerScreen");
});

test("findDanishCodeIdentifiers ignores English identifiers and UI string literals", () => {
  const hits = findDanishCodeIdentifiers(
    [
      "+export default function AccountSettingsScreen() {",
      '+  return <Text>Kontoindstillinger</Text>;',
      "+}",
      "+const title = \"Fødselsdag\";",
    ].join("\n"),
  );
  assert.deepEqual(hits, []);
});

test("findDanishCodeIdentifiers ignores unchanged existing Danish names", () => {
  const hits = findDanishCodeIdentifiers(
    " export default function IndstillingerScreen() {\n   return null;\n }",
  );
  assert.deepEqual(hits, []);
});

test("hook allows git status", () => {
  const result = runHook("git status");
  assert.equal(result.permission, "allow");
  assert.equal(result.status, 0);
});
