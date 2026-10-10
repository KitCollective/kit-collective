import { afterEach, describe, expect, it } from "vitest";
import { apiFetch, getApiBase, joinApiPath } from "./client.js";

const originalFetch = globalThis.fetch;

describe("joinApiPath", () => {
  it("defaults the local API base to IPv4 loopback", () => {
    const base = getApiBase();
    expect(base).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/v1$/);
    if (!import.meta.env.VITE_API_BASE_URL) {
      expect(base).toBe("http://127.0.0.1:3000/v1");
    }
  });

  it("joins contract paths without duplicating /v1", () => {
    const base = getApiBase();
    expect(base.endsWith("/v1")).toBe(true);

    const contractPath = "/admin/catalog/kits/kit-1/photo";
    expect(joinApiPath(base, contractPath)).toBe(`${base}${contractPath}`);
    expect(joinApiPath(base, contractPath)).not.toContain("/v1/v1/");
  });

  it("strips a legacy /v1 prefix from photoPath values", () => {
    const base = getApiBase();
    const legacyPath = "/v1/admin/catalog/kits/kit-1/photo";
    expect(joinApiPath(base, legacyPath)).toBe(`${base}/admin/catalog/kits/kit-1/photo`);
  });
});

describe("apiFetch", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("does not set JSON content-type on POST without a body", async () => {
    let requested: HeadersInit | undefined;
    globalThis.fetch = async (_input, init) => {
      requested = init?.headers;
      return new Response(JSON.stringify({ kitsUpserted: 1, photosWritten: 0 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    await apiFetch("/admin/catalog/clubs/club-1/seasons/season-1/kits/fetch", {
      method: "POST",
      token: "staff-token",
    });

    expect(requested).toEqual({ authorization: "Bearer staff-token" });
  });

  it("sets JSON content-type when a body is sent", async () => {
    let requested: HeadersInit | undefined;
    globalThis.fetch = async (_input, init) => {
      requested = init?.headers;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    await apiFetch("/identity/login", {
      method: "POST",
      body: JSON.stringify({ email: "a@example.com" }),
    });

    expect(requested).toEqual({ "content-type": "application/json" });
  });
});
