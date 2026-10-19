import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CREDITS_URL,
  DEFAULT_MIN_CREDIT_USD,
  envValue,
  minCredit,
  reviewerRoute,
} from "../lib/reviewer-route.mjs";

const KEY = "sk-or-v1-secret";

/** A fake fetch that answers with `status` and `body`, and records what it was asked. */
function fakeFetch(status, body) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        if (body instanceof Error) throw body;
        return body;
      },
    };
  };
  return { fetch, calls };
}

const credits = (total, used) => ({ data: { total_credits: total, total_usage: used } });
const route = (fetch, extra = {}) =>
  reviewerRoute({ key: KEY, override: false, min: DEFAULT_MIN_CREDIT_USD, fetch, ...extra });

test("enough credit: glm, asked with the key as a Bearer on the credits endpoint", async () => {
  const { fetch, calls } = fakeFetch(200, credits(50, 12.5));
  assert.equal(await route(fetch), "REVIEWER glm");
  assert.equal(calls[0].url, CREDITS_URL);
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${KEY}`);
});

test("the 2026-10-19 account (40 of 40 USD used) and anything under the minimum: claude", async () => {
  const empty = await route(fakeFetch(200, credits(40, 40)).fetch);
  assert.match(empty, /^REVIEWER claude low-credit: 0\.00 USD left, below 1 USD$/);
  assert.match(await route(fakeFetch(200, credits(40, 39.5)).fetch), /^REVIEWER claude low-credit/);
  assert.equal(await route(fakeFetch(200, credits(40, 39)).fetch), "REVIEWER glm");
  // A higher minimum from REVIEWER_MIN_CREDIT_USD.
  assert.match(
    await route(fakeFetch(200, credits(40, 35)).fetch, { min: 10 }),
    /^REVIEWER claude low-credit: 5\.00 USD left, below 10 USD$/,
  );
});

test("the override file wins without asking OpenRouter", async () => {
  const { fetch, calls } = fakeFetch(200, credits(100, 0));
  assert.match(await route(fetch, { override: true }), /^REVIEWER claude override: /);
  assert.equal(calls.length, 0);
});

test("no key: claude, without a request", async () => {
  const { fetch, calls } = fakeFetch(200, credits(100, 0));
  assert.match(await route(fetch, { key: null }), /^REVIEWER claude no-key: /);
  assert.equal(calls.length, 0);
});

test("a failed, refused or unreadable request: claude, and the key is never in the line", async () => {
  const thrown = async () => {
    throw new TypeError(`fetch failed for ${KEY}`);
  };
  const lines = [
    await route(thrown),
    await route(fakeFetch(401, {}).fetch),
    await route(fakeFetch(402, {}).fetch),
    await route(fakeFetch(500, {}).fetch),
    await route(fakeFetch(200, new SyntaxError("bad json")).fetch),
    await route(fakeFetch(200, { data: { total_credits: "40" } }).fetch),
    await route(fakeFetch(200, null).fetch),
  ];
  assert.match(
    lines[0],
    /^REVIEWER claude credits-unreachable: the credits request failed \(TypeError\)$/,
  );
  assert.match(lines[1], /^REVIEWER claude credits-key-refused: .*management key/);
  assert.match(lines[2], /^REVIEWER claude credits-unreachable: OpenRouter answered 402$/);
  assert.match(lines[3], /^REVIEWER claude credits-unreachable: OpenRouter answered 500$/);
  assert.match(lines[4], /^REVIEWER claude credits-unreadable/);
  assert.match(lines[5], /^REVIEWER claude credits-unreadable/);
  assert.match(lines[6], /^REVIEWER claude credits-unreadable/);
  for (const line of lines) {
    assert.doesNotMatch(line, /sk-or/);
    assert.doesNotMatch(line, /\n/);
  }
});

test("minCredit: a non-negative number, else the default", () => {
  assert.equal(minCredit(undefined), DEFAULT_MIN_CREDIT_USD);
  assert.equal(minCredit(""), DEFAULT_MIN_CREDIT_USD);
  assert.equal(minCredit("abc"), DEFAULT_MIN_CREDIT_USD);
  assert.equal(minCredit("-1"), DEFAULT_MIN_CREDIT_USD);
  assert.equal(minCredit("0"), 0);
  assert.equal(minCredit("2.5"), 2.5);
});

test("envValue: the process env first, then the .env text, quotes and export stripped", () => {
  const dotenv = 'FOO=1\nexport OPENROUTER_API_KEY="sk-or-from-file"\n';
  assert.equal(envValue("OPENROUTER_API_KEY", {}, dotenv), "sk-or-from-file");
  assert.equal(
    envValue("OPENROUTER_API_KEY", { OPENROUTER_API_KEY: "sk-or-env" }, dotenv),
    "sk-or-env",
  );
  assert.equal(envValue("OPENROUTER_MANAGEMENT_KEY", {}, dotenv), null);
  assert.equal(envValue("OPENROUTER_API_KEY", {}, null), null);
  assert.equal(envValue("OPENROUTER_API_KEY", {}, "OPENROUTER_API_KEY=\n"), null);
});
