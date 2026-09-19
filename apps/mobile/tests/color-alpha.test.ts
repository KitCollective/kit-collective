import { describe, expect, it } from "vitest";
import { getThemeColors, primitive, withAlpha } from "../src/theme/tokens";

function parseRgba(value: string) {
  const match = value.match(/^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/);
  if (!match) {
    return null;
  }

  return {
    red: Number(match[1]),
    green: Number(match[2]),
    blue: Number(match[3]),
    alpha: Number(match[4]),
  };
}

describe("withAlpha", () => {
  it("applies alpha to a six-digit hex color", () => {
    expect(parseRgba(withAlpha(primitive.gray0, 0.72))).toEqual({
      red: 255,
      green: 255,
      blue: 255,
      alpha: 0.72,
    });
    expect(parseRgba(withAlpha(primitive.surfaceDark, 0.5))).toEqual({
      red: 26,
      green: 26,
      blue: 26,
      alpha: 0.5,
    });
  });

  it("returns the input unchanged for non-hex colors", () => {
    expect(withAlpha(primitive.blackAlpha40, 0.5)).toBe(primitive.blackAlpha40);
  });
});

describe("getThemeColors surface alpha", () => {
  it("can derive glass pill fills from documented surface tokens", () => {
    const light = getThemeColors("light");
    const parsed = parseRgba(withAlpha(light.surface, 0.72));
    expect(parsed).toEqual({
      red: 255,
      green: 255,
      blue: 255,
      alpha: 0.72,
    });
  });
});
