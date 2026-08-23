import { describe, expect, it } from "vitest";
import { getApiBase, joinApiPath } from "./client.js";

describe("joinApiPath", () => {
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
