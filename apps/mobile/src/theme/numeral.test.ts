import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveTypeRoles } from "@/theme/brand-fonts-resolve";
import { fontFamily, type } from "@/theme/tokens";

const NUMERAL_ROLES = ["numeral32", "numeral38", "numeral40", "numeral44"] as const;
const NUMERAL_SIZES = { numeral32: 32, numeral38: 38, numeral40: 40, numeral44: 44 } as const;

describe("numeral type roles (docs/design-system.md Typography → numeral)", () => {
  it("sets each role at its size with lineHeight equal to the size and no tracking", () => {
    for (const role of NUMERAL_ROLES) {
      expect(type[role].fontSize).toBe(NUMERAL_SIZES[role]);
      expect(type[role].lineHeight).toBe(type[role].fontSize);
      expect(type[role].letterSpacing).toBe(0);
      expect(type[role].fontFamily).toBe(fontFamily.numeral);
    }
  });

  it("names the face Saira Extra Condensed 700", () => {
    expect(fontFamily.numeral).toBe("SairaExtraCondensed_700Bold");
  });
});

describe("numeral fallback rule", () => {
  it("uses Saira when the numeral face loaded", () => {
    const resolved = resolveTypeRoles(true, "system-ui", true);
    for (const role of NUMERAL_ROLES) {
      expect(resolved[role].fontFamily).toBe(fontFamily.numeral);
    }
  });

  it("defaults numeralEnabled to brandEnabled", () => {
    expect(resolveTypeRoles(true).numeral32.fontFamily).toBe(fontFamily.numeral);
    expect(resolveTypeRoles(false).numeral32.fontFamily).toBe("system-ui");
  });

  it("falls back to Archivo 700 at the same size when only Saira failed", () => {
    const resolved = resolveTypeRoles(true, "system-ui", false);
    for (const role of NUMERAL_ROLES) {
      expect(resolved[role].fontFamily).toBe(fontFamily.displayBold);
      expect(resolved[role].fontSize).toBe(NUMERAL_SIZES[role]);
      expect(resolved[role].lineHeight).toBe(NUMERAL_SIZES[role]);
    }
    expect(resolved.body.fontFamily).toBe(type.body.fontFamily);
    expect(resolved.headingSm.fontFamily).toBe(type.headingSm.fontFamily);
  });

  it("falls back to the system face on the numeral roles when brand fonts fail", () => {
    const resolved = resolveTypeRoles(false);
    for (const role of NUMERAL_ROLES) {
      expect(resolved[role].fontFamily).toBe("system-ui");
      expect(resolved[role].fontSize).toBe(NUMERAL_SIZES[role]);
    }
  });

  it("honours a native system fallback name", () => {
    expect(resolveTypeRoles(false, "System").numeral44.fontFamily).toBe("System");
  });
});

describe("numeral font load wiring", () => {
  const layout = readFileSync(join(__dirname, "../../app/_layout.tsx"), "utf8");
  const pkg = readFileSync(join(__dirname, "../../package.json"), "utf8");
  const brandFonts = readFileSync(join(__dirname, "brand-fonts.tsx"), "utf8");

  it("lists the Saira package", () => {
    expect(pkg).toContain("@expo-google-fonts/saira-extra-condensed");
  });

  it("loads SairaExtraCondensed_700Bold in its own useFonts call", () => {
    expect(layout).toContain("SairaExtraCondensed_700Bold");
    expect(layout.match(/useFonts\(/g)?.length).toBe(2);
    expect(layout).toMatch(/useFonts\(\{\s*SairaExtraCondensed_700Bold,?\s*\}\)/);
  });

  it("keeps the splash waiting for both font loads and passes numeralEnabled", () => {
    expect(layout).toContain("numeralEnabled=");
    expect(layout).toContain("fontsReady");
    expect(layout).toContain("numeralLoaded");
    expect(layout).toContain("numeralError");
  });

  it("carries both facts through the typography hook", () => {
    expect(brandFonts).toContain("numeralEnabled");
  });
});
