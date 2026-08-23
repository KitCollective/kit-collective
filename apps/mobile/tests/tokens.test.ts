import { describe, expect, it } from "vitest";
import { color, getThemeColors, primitive, tabBar, tabBarReserve } from "../src/theme/tokens";

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

describe("tabBarReserve", () => {
  it("reserves space for pill, offset, inset, and extra padding", () => {
    expect(tabBarReserve(34)).toBe(
      tabBar.pillHeight + tabBar.bottomOffset + 34 + tabBar.contentPaddingExtra,
    );
  });
});
