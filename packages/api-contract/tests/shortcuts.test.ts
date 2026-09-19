import { describe, expect, it } from "vitest";
import {
  collectionJerseysQuerySchema,
  collectionShortcutIdParamSchema,
  collectionShortcutReorderSchema,
  collectionShortcutSchema,
  collectionShortcutsSchema,
  collectionShortcutWriteSchema,
} from "../src/collection/shortcuts.js";

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const UUID_B = "550e8400-e29b-41d4-a716-446655440001";

describe("collectionShortcutWriteSchema", () => {
  it("accepts any single facet with optional name", () => {
    expect(collectionShortcutWriteSchema.parse({ clubId: UUID })).toEqual({ clubId: UUID });
    expect(collectionShortcutWriteSchema.parse({ countryId: UUID })).toEqual({ countryId: UUID });
    expect(collectionShortcutWriteSchema.parse({ leagueId: UUID })).toEqual({ leagueId: UUID });
    expect(collectionShortcutWriteSchema.parse({ playerId: UUID })).toEqual({ playerId: UUID });
  });

  it("accepts multiple facets for AND genveje", () => {
    const payload = { countryId: UUID, leagueId: UUID_B, clubId: UUID };
    expect(collectionShortcutWriteSchema.parse(payload)).toEqual(payload);
  });

  it("rejects write without any facet", () => {
    expect(() => collectionShortcutWriteSchema.parse({ name: "Test" })).toThrow();
    expect(() => collectionShortcutWriteSchema.parse({})).toThrow();
  });
});

describe("collectionShortcutSchema", () => {
  it("accepts shortcut with all facet labels and match count", () => {
    const payload = {
      id: UUID,
      name: "Danmark · Superligaen · F.C. København",
      sortOrder: 0,
      countryId: UUID,
      countryLabel: "Danmark",
      leagueId: UUID_B,
      leagueLabel: "Superligaen",
      clubId: UUID,
      clubLabel: "F.C. København",
      playerId: null,
      playerLabel: null,
      matchCount: 2,
    };
    expect(collectionShortcutSchema.parse(payload)).toEqual(payload);
  });
});

describe("collectionShortcutsSchema", () => {
  it("accepts a shortcuts list", () => {
    const payload = {
      shortcuts: [
        {
          id: UUID,
          name: "F.C. København",
          sortOrder: 0,
          countryId: null,
          countryLabel: null,
          leagueId: null,
          leagueLabel: null,
          clubId: UUID,
          clubLabel: "F.C. København",
          playerId: null,
          playerLabel: null,
          matchCount: 0,
        },
      ],
    };
    expect(collectionShortcutsSchema.parse(payload)).toEqual(payload);
  });
});

describe("collectionShortcutReorderSchema", () => {
  it("accepts ordered shortcut ids", () => {
    expect(collectionShortcutReorderSchema.parse({ orderedIds: [UUID, UUID_B] })).toEqual({
      orderedIds: [UUID, UUID_B],
    });
  });
});

describe("collectionJerseysQuerySchema", () => {
  it("accepts optional shortcutId", () => {
    expect(collectionJerseysQuerySchema.parse({})).toEqual({});
    expect(collectionJerseysQuerySchema.parse({ shortcutId: UUID })).toEqual({
      shortcutId: UUID,
    });
  });
});

describe("collectionShortcutIdParamSchema", () => {
  it("accepts shortcutId param", () => {
    expect(collectionShortcutIdParamSchema.parse({ shortcutId: UUID })).toEqual({
      shortcutId: UUID,
    });
  });
});
