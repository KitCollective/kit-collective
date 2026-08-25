import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createActorTokenProvider,
  gitAuthExtraHeader,
  isLinearUnauthorized,
  mintPiAccessToken,
} from "../linear-actor-token.mjs";

test("git auth extraHeader uses Basic x-access-token without embedding the raw token in argv shape", () => {
  const header = gitAuthExtraHeader("ghp_secret_token");
  assert.match(header, /^Authorization: Basic /);
  assert.equal(header.includes("ghp_secret_token"), false);
  const decoded = Buffer.from(header.replace("Authorization: Basic ", ""), "base64").toString("utf8");
  assert.equal(decoded, "x-access-token:ghp_secret_token");
});

test("mintPiAccessToken posts client_credentials to Linear OAuth", async () => {
  const calls = [];
  const token = await mintPiAccessToken({
    clientId: "client-id",
    clientSecret: "client-secret",
    async fetchImpl(url, init) {
      calls.push({ url, init });
      return {
        ok: true,
        async json() {
          return { access_token: "actor-token-1" };
        },
      };
    },
  });
  assert.equal(token, "actor-token-1");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.linear.app/oauth/token");
  assert.match(String(calls[0].init.body), /grant_type=client_credentials/);
});

test("actor token provider uses cached LINEAR_PI_ACCESS_TOKEN then refreshes on unauthorized", async () => {
  let mintCount = 0;
  const provider = createActorTokenProvider({
    env: {
      LINEAR_PI_ACCESS_TOKEN: "cached-token",
      LINEAR_PI_CLIENT_ID: "client-id",
      LINEAR_PI_CLIENT_SECRET: "client-secret",
    },
    async mint() {
      mintCount += 1;
      return `minted-${mintCount}`;
    },
  });
  assert.equal(await provider.getToken(), "cached-token");
  provider.invalidate();
  assert.equal(await provider.getToken(), "minted-1");
  assert.equal(await provider.refresh(), "minted-2");
});

test("isLinearUnauthorized detects 401 and unexpected authentication method errors", () => {
  assert.equal(isLinearUnauthorized(new Error("HTTP 401 from Linear")), true);
  assert.equal(
    isLinearUnauthorized(new Error("Using an unexpected authentication method (apiKey)")),
    true,
  );
  assert.equal(isLinearUnauthorized(new Error("network timeout")), false);
});
