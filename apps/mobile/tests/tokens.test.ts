import { describe, expect, it } from "vitest";
import { color, primitive } from "../src/theme/tokens";

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
