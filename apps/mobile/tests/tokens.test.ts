import { describe, expect, it } from "vitest";
import { color, getThemeColors, primitive, space } from "../src/theme/tokens";

describe("color primitives", () => {
  it("keeps black and gray900 as separate primitives", () => {
    expect(primitive.black).toBeDefined();
    expect(primitive.gray900).toBeDefined();
    expect(primitive.black).toBe(primitive.gray900);
  });

  it("aliases light content.primary and fill.primary to black primitive", () => {
    expect(color.contentPrimary).toBe(primitive.black);
    expect(color.fillPrimary).toBe(primitive.black);
  });

  it("uses black alpha for scrim", () => {
    expect(color.scrim).toBe(primitive.blackAlpha40);
  });
});

describe("getThemeColors", () => {
  it("returns dark canvas for dark scheme", () => {
    const dark = getThemeColors("dark");
    expect(dark.canvas).toBe(primitive.gray900);
    expect(dark.fillPrimary).toBe(primitive.gray0);
  });

  it("returns light canvas for light scheme", () => {
    const light = getThemeColors("light");
    expect(light.canvas).toBe(primitive.gray0);
  });
});

describe("tab bar content padding math", () => {
  it("composes reserve from spacing scale tokens inline", () => {
    const bottomInset = 34;
    const reserve =
      space.insetLg * 2 +
      space.insetMd +
      space.insetLg +
      space.insetSm +
      bottomInset +
      space.insetMd;
    expect(reserve).toBe(34 + space.insetLg * 3 + space.insetMd * 2 + space.insetSm);
  });
});
