import type { CollectionPeerJersey } from "@kit/api-contract";
import { describe, expect, it } from "vitest";
import { buildForeignJerseyView } from "../src/search/foreign-jersey-view-model";

function peerJersey(overrides: Partial<CollectionPeerJersey> = {}): CollectionPeerJersey {
  // SAFETY: the literal lists every field of the peer jersey the view model reads; the rest are fixture values.
  return {
    id: "00000000-0000-4000-8000-000000000105",
    clubId: "00000000-0000-4000-8000-0000000000c1",
    nationalTeamId: null,
    seasonId: "00000000-0000-4000-8000-0000000000a1",
    type: "home",
    clubLabel: "OB",
    seasonLabel: "2023/24",
    ownerHandle: "freja_e2e",
    ownerId: "00000000-0000-4000-8000-0000000000b1",
    ownerInitial: "F",
    biddingEnabled: true,
    size: "m",
    condition: "used",
    playerLabel: null,
    playerNumber: null,
    patches: [],
    ownerCity: "Odense",
    ownerJerseyCount: 3,
    myPendingBid: null,
    photos: [
      {
        id: "00000000-0000-4000-8000-0000000000f1",
        role: "front",
        photoUrl: "/photo/1",
      },
    ],
    ...overrides,
  } as CollectionPeerJersey;
}

describe("foreign jersey caption and title (KIT-290)", () => {
  it("names the type and adds Åben for bud when the jersey is open for bid", () => {
    expect(buildForeignJerseyView(peerJersey()).caption).toBe("Hjemme · Åben for bud");
  });

  it("names only the type when the jersey is not open for bid", () => {
    const view = buildForeignJerseyView(peerJersey({ biddingEnabled: false }));
    expect(view.caption).toBe("Hjemme");
  });

  it("titles with the club and the season", () => {
    const view = buildForeignJerseyView(peerJersey());
    expect(view.title).toBe("OB");
    expect(view.season).toBe("2023/24");
  });
});

describe("foreign jersey player row (KIT-290)", () => {
  it("has no player row without a player", () => {
    expect(buildForeignJerseyView(peerJersey()).playerRow).toBeNull();
  });

  it("shows the name, the number and Spiller på ryggen for a player", () => {
    const row = buildForeignJerseyView(
      peerJersey({ playerLabel: "Mads Hermansen", playerNumber: "1" }),
    ).playerRow;
    expect(row).toEqual({
      kind: "player",
      name: "Mads Hermansen",
      number: 1,
      caption: "Spiller på ryggen",
      accessibilityLabel: "Spiller på ryggen, Mads Hermansen, nummer 1",
    });
  });

  it("keeps a player without a number", () => {
    const row = buildForeignJerseyView(
      peerJersey({ playerLabel: "Mads Hermansen", playerNumber: null }),
    ).playerRow;
    expect(row?.number).toBeNull();
    expect(row?.accessibilityLabel).toBe("Spiller på ryggen, Mads Hermansen");
  });
});

describe("foreign jersey fact rows (KIT-290)", () => {
  it("shows Størrelse and Stand, and leaves Badge out without a badge", () => {
    const rows = buildForeignJerseyView(peerJersey()).factRows;
    expect(rows.map((row) => row.key)).toEqual(["size", "condition"]);
    expect(rows.map((row) => row.label)).toEqual(["Størrelse", "Stand"]);
  });

  it("adds a Badge row listing the badge labels", () => {
    const rows = buildForeignJerseyView(
      peerJersey({
        patches: [
          { id: "00000000-0000-4000-8000-0000000000e1", label: "Superliga" },
          { id: "00000000-0000-4000-8000-0000000000e2", label: "Fair play" },
        ],
      }),
    ).factRows;
    expect(rows.map((row) => row.key)).toEqual(["size", "condition", "badge"]);
    expect(rows[2]).toMatchObject({ label: "Badge", value: "Superliga, Fair play" });
  });

  it("never shows an unset fact as Tilføj: it is left out", () => {
    const rows = buildForeignJerseyView(peerJersey()).factRows;
    expect(rows.every((row) => row.muted === false)).toBe(true);
    expect(rows.some((row) => row.value === "Tilføj")).toBe(false);
  });

  it("carries the label and the value in every row's accessible name", () => {
    const rows = buildForeignJerseyView(
      peerJersey({ patches: [{ id: "00000000-0000-4000-8000-0000000000e1", label: "Superliga" }] }),
    ).factRows;
    expect(rows.length).toBe(3);
    for (const row of rows) {
      expect(row.value.length).toBeGreaterThan(0);
      expect(row.accessibilityLabel).toBe(`${row.label}, ${row.value}`);
    }
  });
});

describe("foreign jersey owner row (KIT-290)", () => {
  it("reads city · n trøjer when the owner shows a city", () => {
    const owner = buildForeignJerseyView(peerJersey()).owner;
    expect(owner.handle).toBe("freja_e2e");
    expect(owner.caption).toBe("Odense · 3 trøjer");
    expect(owner.accessibilityLabel).toBe("Ejer, freja_e2e, Odense · 3 trøjer");
  });

  it("reads n trøjer alone without a city", () => {
    const owner = buildForeignJerseyView(peerJersey({ ownerCity: null })).owner;
    expect(owner.caption).toBe("3 trøjer");
    expect(owner.accessibilityLabel).toBe("Ejer, freja_e2e, 3 trøjer");
  });

  it("reads 1 trøje in the singular", () => {
    const owner = buildForeignJerseyView(peerJersey({ ownerJerseyCount: 1 })).owner;
    expect(owner.caption).toBe("Odense · 1 trøje");
  });

  it("opens the owner's Peer Profil and names the block Ejer", () => {
    const owner = buildForeignJerseyView(peerJersey()).owner;
    expect(owner.href).toBe("/(tabs)/search/peer/freja_e2e");
    expect(owner.sectionCaption).toBe("Ejer");
  });
});
