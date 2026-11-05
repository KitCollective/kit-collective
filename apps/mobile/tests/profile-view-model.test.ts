import type { Entitlement } from "@kit/api-contract";
import { describe, expect, it } from "vitest";
import {
  identityCaption,
  plusStatusText,
  profileHomeRows,
} from "../src/profile/profile-view-model";

const now = new Date("2026-11-05T12:00:00.000Z");

function entitlement(overrides: Partial<Entitlement>): Entitlement {
  return { live: false, source: null, expires: null, trialUsed: false, ...overrides };
}

describe("plusStatusText", () => {
  it("counts the days left of a live trial, rounded up", () => {
    const value = entitlement({
      live: true,
      source: "trial",
      trialUsed: true,
      expires: "2026-11-12T11:00:00.000Z",
    });
    expect(plusStatusText(value, now)).toBe("Prøve · 7 dage tilbage");
  });

  it("says 1 dag in the singular and never goes below 0 days", () => {
    const lastDay = entitlement({
      live: true,
      source: "trial",
      trialUsed: true,
      expires: "2026-11-05T18:00:00.000Z",
    });
    expect(plusStatusText(lastDay, now)).toBe("Prøve · 1 dag tilbage");

    const lapsed = entitlement({
      live: true,
      source: "trial",
      trialUsed: true,
      expires: "2026-11-01T00:00:00.000Z",
    });
    expect(plusStatusText(lapsed, now)).toBe("Prøve · 0 dage tilbage");
  });

  it("calls any other live source Aktiv", () => {
    for (const source of ["iap_apple", "iap_google", "comp"] as const) {
      expect(plusStatusText(entitlement({ live: true, source }), now)).toBe("Aktiv");
    }
  });

  it("calls an entitlement that was once there and is no longer live Udløbet", () => {
    expect(plusStatusText(entitlement({ trialUsed: true }), now)).toBe("Udløbet");
    expect(plusStatusText(entitlement({ source: "iap_apple" }), now)).toBe("Udløbet");
    expect(plusStatusText(entitlement({ expires: "2026-10-01T00:00:00.000Z" }), now)).toBe(
      "Udløbet",
    );
  });

  it("calls a Collector who never had Plus Ikke aktiv", () => {
    expect(plusStatusText(entitlement({}), now)).toBe("Ikke aktiv");
    expect(plusStatusText(null, now)).toBe("Ikke aktiv");
  });
});

describe("identityCaption", () => {
  it("shows the city and the jersey count when Vis by is on", () => {
    expect(
      identityCaption({ city: "Aarhus", countryLabel: "Danmark", showCity: true, jerseyCount: 12 }),
    ).toBe("Aarhus · 12 trøjer");
  });

  it("falls back to the country when Vis by is off or no city is set", () => {
    expect(
      identityCaption({ city: "Aarhus", countryLabel: "Danmark", showCity: false, jerseyCount: 3 }),
    ).toBe("Danmark · 3 trøjer");
    expect(
      identityCaption({ city: null, countryLabel: "Danmark", showCity: true, jerseyCount: 3 }),
    ).toBe("Danmark · 3 trøjer");
  });

  it("leaves the location out when there is none", () => {
    expect(
      identityCaption({ city: null, countryLabel: null, showCity: true, jerseyCount: 0 }),
    ).toBe("0 trøjer");
  });

  it("reads 1 trøje in the singular", () => {
    expect(
      identityCaption({ city: null, countryLabel: "Danmark", showCity: false, jerseyCount: 1 }),
    ).toBe("Danmark · 1 trøje");
  });
});

describe("profileHomeRows", () => {
  it("returns exactly Favoritter and KitCollective+, announced with label and value", () => {
    const rows = profileHomeRows({
      favoriteCount: 4,
      entitlement: entitlement({ live: true, source: "iap_google" }),
      now,
    });
    expect(rows).toEqual([
      {
        key: "favorites",
        label: "Favoritter",
        value: "4",
        accessibilityLabel: "Favoritter, 4",
      },
      {
        key: "plus",
        label: "KitCollective+",
        value: "Aktiv",
        accessibilityLabel: "KitCollective+, Aktiv",
      },
    ]);
  });

  it("has no Indstillinger or Cookie row", () => {
    const labels = profileHomeRows({ favoriteCount: 0, entitlement: null, now }).map(
      (row) => row.label,
    );
    expect(labels).not.toContain("Indstillinger");
    expect(labels).not.toContain("Cookie-indstillinger");
  });
});
