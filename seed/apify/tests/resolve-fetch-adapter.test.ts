import { afterEach, describe, expect, it } from "vitest";
import { resolveFetchAdapter } from "../src/resolve-fetch-adapter.js";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("resolveFetchAdapter", () => {
  it("defaults to kader fetch when no env is set", async () => {
    delete process.env.SEED_APIFY_FIXTURE;
    delete process.env.SEED_KADER_HTML;
    delete process.env.SEED_APIFY_RECORDINGS;
    delete process.env.APIFY_TOKEN;
    delete process.env.SEED_FETCH;

    const resolved = await resolveFetchAdapter();
    expect(resolved).toBeDefined();
    expect(resolved.adapter.fetchClubSeason).toBeTypeOf("function");
  });

  it("uses nested fixture adapter when SEED_APIFY_FIXTURE is set", async () => {
    process.env.SEED_APIFY_FIXTURE = "/tmp/superliga-mini.json";
    const resolved = await resolveFetchAdapter();
    expect(resolved.adapter.fetchClubSeason).toBeTypeOf("function");
  });

  it("uses kader HTML fixtures when SEED_KADER_HTML is set", async () => {
    process.env.SEED_KADER_HTML = "/tmp/kader-html";
    const resolved = await resolveFetchAdapter();
    expect(resolved.adapter.fetchClubSeason).toBeTypeOf("function");
  });

  it("uses kader fetch by default even when SEED_APIFY_RECORDINGS is set", async () => {
    process.env.SEED_APIFY_RECORDINGS = "/tmp/actor-recordings";
    delete process.env.SEED_FETCH;

    const resolved = await resolveFetchAdapter();
    expect(resolved.adapter.fetchClubSeason).toBeTypeOf("function");
  });

  it("uses Apify recordings only when SEED_FETCH=apify", async () => {
    process.env.SEED_FETCH = "apify";
    process.env.SEED_APIFY_RECORDINGS = "/tmp/actor-recordings";

    const resolved = await resolveFetchAdapter();
    expect(resolved.adapter.fetchClubSeason).toBeTypeOf("function");
  });

  it("throws when SEED_FETCH=apify without recordings or token", async () => {
    process.env.SEED_FETCH = "apify";
    delete process.env.SEED_APIFY_RECORDINGS;
    delete process.env.APIFY_TOKEN;

    await expect(resolveFetchAdapter()).rejects.toThrow(/SEED_FETCH=apify requires/);
  });

  it("does not select Apify when only APIFY_TOKEN is set", async () => {
    process.env.APIFY_TOKEN = "test-token";
    delete process.env.SEED_FETCH;

    const resolved = await resolveFetchAdapter();
    expect(resolved.adapter.fetchClubSeason).toBeTypeOf("function");
  });
});
