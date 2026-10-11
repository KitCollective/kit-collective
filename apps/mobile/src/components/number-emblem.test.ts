import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NUMBER_EMBLEM_RADIUS, numberEmblemStyle } from "@/components/number-emblem-style";
import { resolveTypeRoles } from "@/theme/brand-fonts-resolve";
import { getThemeColors } from "@/theme/tokens";

const colors = getThemeColors("light");
const typography = resolveTypeRoles(true);

describe("numberEmblemStyle sizes (docs/design-system.md → Number emblem)", () => {
  it("md is 44x44, radius 10, numeral32", () => {
    const style = numberEmblemStyle("md", "rest", colors, typography);
    expect(style.tile.width).toBe(44);
    expect(style.tile.height).toBe(44);
    expect(style.tile.borderRadius).toBe(10);
    expect(NUMBER_EMBLEM_RADIUS).toBe(10);
    expect(style.numeral?.fontSize).toBe(32);
    expect(style.numeral?.fontFamily).toBe(typography.numeral32.fontFamily);
  });

  it("lg is 52x52, radius 10, numeral38", () => {
    const style = numberEmblemStyle("lg", "rest", colors, typography);
    expect(style.tile.width).toBe(52);
    expect(style.tile.height).toBe(52);
    expect(style.tile.borderRadius).toBe(10);
    expect(style.numeral?.fontSize).toBe(38);
  });

  it("never lets the numeral line exceed the tile", () => {
    for (const size of ["md", "lg"] as const) {
      const style = numberEmblemStyle(size, "selected", colors, typography);
      expect(style.numeral?.lineHeight).toBeLessThanOrEqual(style.tile.height);
      expect(style.numeral?.lineHeight).toBe(style.numeral?.fontSize);
    }
  });

  it("centres the content", () => {
    const style = numberEmblemStyle("md", "rest", colors, typography);
    expect(style.tile.alignItems).toBe("center");
    expect(style.tile.justifyContent).toBe("center");
  });

  it("keeps the fallback face at the same size", () => {
    const fallback = resolveTypeRoles(true, "system-ui", false);
    const style = numberEmblemStyle("lg", "rest", colors, fallback);
    expect(style.numeral?.fontFamily).toBe("Archivo_700Bold");
    expect(style.numeral?.fontSize).toBe(38);
  });
});

describe("numberEmblemStyle states", () => {
  it("selected is fill.primary with content.inverse", () => {
    const style = numberEmblemStyle("md", "selected", colors, typography);
    expect(style.tile.backgroundColor).toBe(colors.fillPrimary);
    expect(style.numeral?.color).toBe(colors.contentInverse);
    expect(style.tile.borderWidth).toBe(0);
  });

  it("rest is fill.secondary with content.primary", () => {
    const style = numberEmblemStyle("md", "rest", colors, typography);
    expect(style.tile.backgroundColor).toBe(colors.fillSecondary);
    expect(style.numeral?.color).toBe(colors.contentPrimary);
    expect(style.tile.borderWidth).toBe(0);
  });

  it("add is a dashed border.subtle outline with no fill, no numeral, and a plus icon", () => {
    const style = numberEmblemStyle("md", "add", colors, typography);
    expect(style.tile.borderStyle).toBe("dashed");
    expect(style.tile.borderColor).toBe(colors.borderSubtle);
    expect(style.tile.borderWidth).toBe(1);
    expect(style.tile.backgroundColor).toBeUndefined();
    expect(style.numeral).toBeNull();
    expect(style.icon).not.toBeNull();
  });

  it("selected and rest carry no icon", () => {
    expect(numberEmblemStyle("md", "selected", colors, typography).icon).toBeNull();
    expect(numberEmblemStyle("lg", "rest", colors, typography).icon).toBeNull();
  });

  it("follows the dark scheme tokens", () => {
    const dark = getThemeColors("dark");
    const style = numberEmblemStyle("md", "selected", dark, typography);
    expect(style.tile.backgroundColor).toBe(dark.fillPrimary);
    expect(style.numeral?.color).toBe(dark.contentInverse);
  });
});

describe("numberEmblemStyle fixed tile", () => {
  it("does not scale the numeral with Dynamic Type", () => {
    for (const state of ["selected", "rest", "add"] as const) {
      expect(numberEmblemStyle("md", state, colors, typography).allowFontScaling).toBe(false);
    }
  });
});

describe("NumberEmblem component source", () => {
  const source = readFileSync(join(__dirname, "number-emblem.tsx"), "utf8");

  it("is not an accessibility element itself", () => {
    expect(source).not.toMatch(/accessibilityLabel/);
    expect(source).not.toMatch(/accessibilityRole/);
    expect(source).not.toMatch(/\baccessible=/);
  });

  it("hides the plus icon from assistive tech", () => {
    expect(source).toContain("accessibilityElementsHidden");
    expect(source).toContain('importantForAccessibility="no-hide-descendants"');
  });

  it("renders the number as a Text child with font scaling off", () => {
    expect(source).toContain("allowFontScaling={style.allowFontScaling}");
  });

  it("uses theme and resolved typography, no raw colors", () => {
    expect(source).toContain("useTheme()");
    expect(source).toContain("useTypography()");
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).not.toMatch(/rgba?\(/);
  });
});
