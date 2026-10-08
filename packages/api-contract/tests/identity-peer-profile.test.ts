import { describe, expect, it } from "vitest";
import { identityPeerProfileSchema } from "../src/identity/peer-profile.js";

describe("identityPeerProfileSchema", () => {
  it("parses public peer profile fields only", () => {
    expect(
      identityPeerProfileSchema.parse({
        id: "00000000-0000-0000-0000-000000000001",
        handle: "collector_a",
        aboutMe: "Samler siden 2020",
        avatarUrl: "/v1/identity/peers/00000000-0000-0000-0000-000000000001/avatar",
        countryLabel: "Danmark",
        city: "København",
        showCity: true,
      }),
    ).toEqual({
      id: "00000000-0000-0000-0000-000000000001",
      handle: "collector_a",
      aboutMe: "Samler siden 2020",
      avatarUrl: "/v1/identity/peers/00000000-0000-0000-0000-000000000001/avatar",
      countryLabel: "Danmark",
      city: "København",
      showCity: true,
    });
  });

  it("rejects settings fields on peer profile", () => {
    expect(() =>
      identityPeerProfileSchema.parse({
        id: "00000000-0000-0000-0000-000000000001",
        handle: "collector_a",
        aboutMe: null,
        avatarUrl: null,
        countryLabel: null,
        city: null,
        showCity: false,
        email: "secret@example.com",
      }),
    ).toThrow();
  });
});
