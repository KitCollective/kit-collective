import {
  formatProfileLocationCaption,
  formatProfileLocationMeta,
  popularCitiesForCountryLabel,
} from "@kit/domain";
import { describe, expect, it } from "vitest";

describe("formatProfileLocationCaption", () => {
  it("shows city and country when showCity is on", () => {
    expect(formatProfileLocationCaption("København", "Danmark", true)).toBe("København · Danmark");
  });

  it("shows country only when showCity is off", () => {
    expect(formatProfileLocationCaption("København", "Danmark", false)).toBe("Danmark");
  });

  it("hides city on the card when showCity is false even if city is set", () => {
    expect(formatProfileLocationCaption("Aarhus", "Danmark", false)).toBe("Danmark");
  });
});

describe("formatProfileLocationMeta", () => {
  it("formats edit-row meta as city and country", () => {
    expect(formatProfileLocationMeta("København", "Danmark")).toBe("København · Danmark");
  });
});

describe("popularCitiesForCountryLabel", () => {
  it("returns Danish popular cities for Danmark", () => {
    expect(popularCitiesForCountryLabel("Danmark")).toContain("København");
  });
});
