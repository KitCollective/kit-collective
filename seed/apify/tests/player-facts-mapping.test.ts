import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  catalogLabel,
  club,
  country,
  createDb,
  player,
  playerNationality,
  resetDatabase,
} from "@kit/db";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { mapClubSeasonToPayload } from "../src/fetch/actor-mapper.js";
import { parseKaderHtml } from "../src/fetch/kader-html-parser.js";
import { mapFacts } from "../src/map/index.js";
import { normalize } from "../src/normalize/index.js";
import type { TransfermarktRawPayload, TransfermarktRawPlayer } from "../src/types.js";
import { resolveSeedApifyTestDatabaseUrl } from "./test-database-url.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/db/migrations",
);

const TEST_DATABASE_URL = resolveSeedApifyTestDatabaseUrl();

const COMPETITION: TransfermarktRawPayload["competition"] = {
  id: "dk1",
  name: "Superliga",
  country: { id: "country-dk", name: "Denmark", iso3166: "DK" },
};

function clubSeasonPayload(
  players: TransfermarktRawPlayer[],
  clubName = "FC Copenhagen",
  officialName?: string,
): TransfermarktRawPayload {
  return {
    competition: COMPETITION,
    seasons: [
      {
        id: "2012",
        label: "2012/13",
        startDate: "2012-07-01",
        endDate: "2013-06-30",
        calendarKind: "split_year",
        clubs: [
          {
            id: "190",
            name: clubName,
            country: { iso3166: "DK", name: "Denmark" },
            officialName,
            nameIsOfficialFallback: Boolean(officialName && officialName === clubName),
            players,
          },
        ],
      },
    ],
  };
}

async function mapPayload(payload: TransfermarktRawPayload) {
  return mapFacts(createDb(TEST_DATABASE_URL).db, normalize(payload));
}

describe("player facts reach Postgres", () => {
  beforeAll(async () => {
    await resetDatabase(TEST_DATABASE_URL, migrationsFolder);
    await mapPayload(
      clubSeasonPayload([
        {
          id: "22851",
          name: "Kim Christensen",
          jerseyNumber: 1,
          position: "Goalkeeper",
          dateOfBirth: "1979-07-16",
          nationalityIso: "DK",
          nationalityName: "Denmark",
          heightCm: 187,
          preferredFoot: "right",
        },
        {
          id: "103558",
          name: "Mos",
          fullName: "Mustafa Abdellaoue",
          jerseyNumber: 9,
          dateOfBirth: "1988-08-01",
          placeOfBirth: "Oslo",
          nationalityIso: "NO",
          nationalityName: "Norway",
          heightCm: 181,
          preferredFoot: "right",
        },
      ]),
    );
  });

  it("writes date of birth and resolves the primary country", async () => {
    const { db } = createDb(TEST_DATABASE_URL);
    const rows = await db
      .select({
        dateOfBirth: player.dateOfBirth,
        placeOfBirth: player.placeOfBirth,
        heightCm: player.heightCm,
        preferredFoot: player.preferredFoot,
        iso: country.iso3166,
      })
      .from(player)
      .leftJoin(country, eq(player.primaryCountryId, country.id));

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.dateOfBirth !== null)).toBe(true);
    expect(rows.every((row) => row.iso !== null)).toBe(true);
    expect(rows).toContainEqual({
      dateOfBirth: "1979-07-16",
      placeOfBirth: null,
      heightCm: 187,
      preferredFoot: "right",
      iso: "DK",
    });
    expect(rows).toContainEqual({
      dateOfBirth: "1988-08-01",
      placeOfBirth: "Oslo",
      heightCm: 181,
      preferredFoot: "right",
      iso: "NO",
    });
  });

  it("stores the profile full name as an alias, not as a second label", async () => {
    const { db } = createDb(TEST_DATABASE_URL);
    const labels = await db
      .select({ kind: catalogLabel.kind, text: catalogLabel.text })
      .from(catalogLabel)
      .where(eq(catalogLabel.entityType, "player"));

    expect(labels).toContainEqual({ kind: "label", text: "Mos" });
    expect(labels).toContainEqual({ kind: "alias", text: "Mustafa Abdellaoue" });
    expect(labels.filter((row) => row.kind === "label")).toHaveLength(2);
  });
});

/** The live-cached FC Copenhagen 2012/13 squad page, parsed into a club-season payload. */
function liveClubSeasonPayload(): TransfermarktRawPayload {
  const html = readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../fixtures/kader-html/kader/190-2012.html",
    ),
    "utf8",
  );
  const { squadRows } = parseKaderHtml(html, "190", "FC Copenhagen", 2012);
  return mapClubSeasonToPayload({
    competitionSlug: "dk1",
    clubExternalId: "190",
    seasonLabel: "2012/13",
    clubName: "FC Copenhagen",
    squadRows,
    profileByPlayerId: new Map(),
  });
}

describe("the live FC Copenhagen 2012/13 squad page seeds complete players", () => {
  let mapped: Awaited<ReturnType<typeof mapPayload>>;

  beforeAll(async () => {
    await resetDatabase(TEST_DATABASE_URL, migrationsFolder);
    mapped = await mapPayload(liveClubSeasonPayload());
  });

  it("gives every player a date of birth and a primary country", async () => {
    expect(mapped.players).toBe(32);

    const { db } = createDb(TEST_DATABASE_URL);
    const rows = await db
      .select({ dateOfBirth: player.dateOfBirth, iso: country.iso3166 })
      .from(player)
      .leftJoin(country, eq(player.primaryCountryId, country.id));

    expect(rows).toHaveLength(32);
    expect(rows.filter((row) => row.dateOfBirth !== null)).toHaveLength(32);
    expect(rows.filter((row) => row.iso !== null)).toHaveLength(32);
    // Denmark, Sweden, Iceland, Costa Rica, Brazil, Norway, Senegal, Angola.
    expect(new Set(rows.map((row) => row.iso)).size).toBe(8);
  });
});

interface StoredNationality {
  playerName: string;
  iso: string;
  sortOrder: number;
  isPrimary: boolean;
}

async function storedNationalities(): Promise<StoredNationality[]> {
  const { db } = createDb(TEST_DATABASE_URL);
  const rows = await db
    .select({
      playerName: catalogLabel.text,
      iso: country.iso3166,
      sortOrder: playerNationality.sortOrder,
      countryId: playerNationality.countryId,
      primaryCountryId: player.primaryCountryId,
    })
    .from(playerNationality)
    .innerJoin(player, eq(playerNationality.playerId, player.id))
    .innerJoin(country, eq(playerNationality.countryId, country.id))
    .innerJoin(
      catalogLabel,
      and(
        eq(catalogLabel.entityType, "player"),
        eq(catalogLabel.entityId, player.id),
        eq(catalogLabel.kind, "label"),
      ),
    )
    .orderBy(catalogLabel.text, playerNationality.sortOrder);

  return rows.map(({ countryId, primaryCountryId, ...row }) => ({
    ...row,
    isPrimary: countryId === primaryCountryId,
  }));
}

describe("every citizenship on the live squad page reaches PlayerNationality", () => {
  beforeAll(async () => {
    await resetDatabase(TEST_DATABASE_URL, migrationsFolder);
    await mapPayload(liveClubSeasonPayload());
  });

  it("keeps both citizenships of a dual national, primary in slot 0", async () => {
    const rows = await storedNationalities();

    expect(rows.filter((row) => row.playerName === "Thomas Delaney")).toEqual([
      { playerName: "Thomas Delaney", iso: "DK", sortOrder: 0, isPrimary: true },
      { playerName: "Thomas Delaney", iso: "US", sortOrder: 1, isPrimary: false },
    ]);
    expect(rows.filter((row) => row.playerName === "Danny Amankwaa")).toEqual([
      { playerName: "Danny Amankwaa", iso: "DK", sortOrder: 0, isPrimary: true },
      { playerName: "Danny Amankwaa", iso: "GH", sortOrder: 1, isPrimary: false },
    ]);
    expect(rows.filter((row) => row.playerName === "Igor Vetokele")).toEqual([
      { playerName: "Igor Vetokele", iso: "AO", sortOrder: 0, isPrimary: true },
      { playerName: "Igor Vetokele", iso: "BE", sortOrder: 1, isPrimary: false },
    ]);
    expect(rows.filter((row) => row.playerName === "Mos")).toEqual([
      { playerName: "Mos", iso: "NO", sortOrder: 0, isPrimary: true },
      { playerName: "Mos", iso: "MA", sortOrder: 1, isPrimary: false },
    ]);
  });

  it("keeps exactly one row for a single national and one primary per player", async () => {
    const rows = await storedNationalities();

    expect(rows.filter((row) => row.playerName === "Kim Christensen")).toEqual([
      { playerName: "Kim Christensen", iso: "DK", sortOrder: 0, isPrimary: true },
    ]);
    // 32 players, 4 of them dual nationals.
    expect(rows).toHaveLength(36);
    expect(rows.filter((row) => row.isPrimary)).toHaveLength(32);
    expect(rows.filter((row) => row.sortOrder === 0)).toHaveLength(32);
  });

  it("leaves player.primary_country_id alone", async () => {
    const { db } = createDb(TEST_DATABASE_URL);
    const rows = await db
      .select({ iso: country.iso3166 })
      .from(player)
      .leftJoin(country, eq(player.primaryCountryId, country.id));

    expect(rows.filter((row) => row.iso !== null)).toHaveLength(32);
    // The secondary citizenships add no primary country of their own.
    expect(new Set(rows.map((row) => row.iso)).size).toBe(8);
  });

  it("re-seeding the same club season adds no rows", async () => {
    const before = await storedNationalities();
    await mapPayload(liveClubSeasonPayload());
    const after = await storedNationalities();

    expect(after).toEqual(before);
  });
});

describe("club labels do not fan out across grains", () => {
  beforeAll(async () => {
    await resetDatabase(TEST_DATABASE_URL, migrationsFolder);
    // Club-season grain first: it knows the short display name.
    await mapPayload(clubSeasonPayload([]));
    // Then the Club grain, which has nothing shorter than the official name.
    await mapPayload(clubSeasonPayload([], "Football Club København", "Football Club København"));
  });

  it("keeps one display label per club and files the official name as an alias", async () => {
    const { db } = createDb(TEST_DATABASE_URL);
    const clubs = await db.select({ id: club.id }).from(club);
    expect(clubs).toHaveLength(1);

    const labels = await db
      .select({ locale: catalogLabel.locale, kind: catalogLabel.kind, text: catalogLabel.text })
      .from(catalogLabel)
      .where(and(eq(catalogLabel.entityType, "club"), eq(catalogLabel.entityId, clubs[0]!.id)));

    expect(labels.filter((row) => row.kind === "label")).toEqual([
      { locale: "en", kind: "label", text: "FC Copenhagen" },
    ]);
    expect(labels).toContainEqual({
      locale: "en",
      kind: "alias",
      text: "Football Club København",
    });
    // Both strings share one locale bucket, so the alias index dedupes them.
    expect(new Set(labels.map((row) => row.locale))).toEqual(new Set(["en"]));
  });
});
