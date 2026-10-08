import { describe, expect, it } from "vitest";
import { seedLabelLocale } from "../src/normalize/seed-label-locale.js";

describe("seedLabelLocale", () => {
  it("defaults English seed club names to en", () => {
    expect(seedLabelLocale("FC Copenhagen")).toBe("en");
    expect(seedLabelLocale("Brondby IF")).toBe("en");
  });

  it("uses mul for locale-invariant personal names", () => {
    expect(seedLabelLocale("Jonas Wind")).toBe("mul");
    expect(seedLabelLocale("Kevin Jakobsen")).toBe("mul");
    expect(seedLabelLocale("Lautaro Martínez")).toBe("mul");
  });

  it("uses en for ASCII transliterations that differ in Nordic locales", () => {
    expect(seedLabelLocale("Rasmus Hojlund")).toBe("en");
  });
});
