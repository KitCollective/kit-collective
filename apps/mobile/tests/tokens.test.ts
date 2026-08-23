import { describe, expect, it } from "vitest";
import { floatingTabBarLayout, tabBarReserve } from "../src/theme/tab-bar-layout";
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

describe("floatingTabBarLayout", () => {
  it("composes layout constants from the spacing scale only", () => {
    expect(floatingTabBarLayout.pillHeight).toBe(space.insetLg * 2 + space.insetMd);
    expect(floatingTabBarLayout.bottomOffset).toBe(space.insetLg + space.insetSm);
    expect(floatingTabBarLayout.horizontalInset).toBe(space.insetLg);
    expect(floatingTabBarLayout.contentPaddingExtra).toBe(space.insetMd);
  });
});

describe("tabBarReserve", () => {
  it("reserves space for pill, offset, inset, and extra padding", () => {
    expect(tabBarReserve(34)).toBe(
      floatingTabBarLayout.pillHeight +
        floatingTabBarLayout.bottomOffset +
        34 +
        floatingTabBarLayout.contentPaddingExtra,
    );
  });
});
