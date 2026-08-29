/**
 * KIT-113 — git auth header lives on worktree.mjs after actor-token removal.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { gitAuthExtraHeader } from "../worktree.mjs";

test("git auth extraHeader uses Basic x-access-token without embedding the raw token in argv shape", () => {
  const header = gitAuthExtraHeader("ghp_secret_token");
  assert.match(header, /^Authorization: Basic /);
  assert.equal(header.includes("ghp_secret_token"), false);
  const decoded = Buffer.from(header.replace("Authorization: Basic ", ""), "base64").toString(
    "utf8",
  );
  assert.equal(decoded, "x-access-token:ghp_secret_token");
});
