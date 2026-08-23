import { describe, expect, it } from "vitest";
import { resolveFontFamily, resolveTypeRoles } from "../src/theme/brand-fonts-resolve";
import { fontFamily, type } from "../src/theme/tokens";

describe("resolveFontFamily", () => {
  it("returns brand family when brand fonts are enabled", () => {
    expect(resolveFontFamily(fontFamily.display, true)).toBe(fontFamily.display);
  });

  it("falls back to system-ui when brand fonts are disabled", () => {
    expect(resolveFontFamily(fontFamily.display, false)).toBe("system-ui");
  });
});

describe("resolveTypeRoles", () => {
  it("resolves every type role with brand fonts when enabled", () => {
    const resolved = resolveTypeRoles(true);
    expect(resolved.headingSm.fontFamily).toBe(type.headingSm.fontFamily);
    expect(resolved.mono.fontFamily).toBe(type.mono.fontFamily);
  });

  it("falls back all type roles to system-ui when brand fonts are disabled", () => {
    const resolved = resolveTypeRoles(false);
    for (const role of Object.values(resolved)) {
      expect(role.fontFamily).toBe("system-ui");
    }
  });
});
