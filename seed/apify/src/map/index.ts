import {
  catalogLabel,
  club,
  country,
  type Db,
  externalId,
  honour,
  league,
  player,
  playerClubSeason,
  playerPhoto,
  season,
  teamSeason,
} from "@kit/db";
import { type CatalogEntityType, countryCodesForIso3166, type LabelLocale } from "@kit/domain";
import { and, eq } from "drizzle-orm";
import { assertFactsSeasonScope } from "../scope-isolation.js";
import type {
  MapResult,
  NormalizedClub,
  NormalizedFacts,
  NormalizedPlayer,
  NormalizedSeason,
} from "../types.js";
import { TM_SYSTEM } from "../types.js";

export type MapDepth = "league" | "league_season" | "club" | "full";

export interface PortraitStore {
  putObject(key: string, bytes: Uint8Array): Promise<void>;
}

export interface MapFactsOptions {
  allowedSeasonLabels?: ReadonlySet<string>;
  /** league = country+league only; league_season skips players; club = facts+honours; full = default walk. */
  depth?: MapDepth;
  portraitStore?: PortraitStore;
}

async function findEntityId(db: Db, value: string): Promise<string | undefined> {
  const row = await db
    .select({ entityId: externalId.entityId })
    .from(externalId)
    .where(and(eq(externalId.system, TM_SYSTEM), eq(externalId.value, value)))
    .limit(1);

  return row[0]?.entityId;
}

async function linkExternalId(
  db: Db,
  entityType: (typeof externalId.$inferInsert)["entityType"],
  entityIdValue: string,
  value: string,
): Promise<void> {
  const existing = await findEntityId(db, value);
  if (existing) {
    if (existing !== entityIdValue) {
      throw new Error(`ExternalId ${TM_SYSTEM}:${value} already linked to another entity`);
    }
    return;
  }

  await db.insert(externalId).values({
    entityType,
    entityId: entityIdValue,
    system: TM_SYSTEM,
    value,
  });
}

async function upsertCatalogLabel(
  db: Db,
  entityType: CatalogEntityType,
  entityIdValue: string,
  locale: LabelLocale,
  text: string,
  kind: "label" | "alias" = "label",
): Promise<boolean> {
  const existing = await db
    .select({ id: catalogLabel.id, text: catalogLabel.text })
    .from(catalogLabel)
    .where(
      and(
        eq(catalogLabel.entityType, entityType),
        eq(catalogLabel.entityId, entityIdValue),
        eq(catalogLabel.locale, locale),
        eq(catalogLabel.kind, kind),
        ...(kind === "alias" ? [eq(catalogLabel.text, text)] : []),
      ),
    )
    .limit(1);

  if (existing[0]) {
    if (kind === "label" && existing[0].text !== text) {
      await db.update(catalogLabel).set({ text }).where(eq(catalogLabel.id, existing[0].id));
      return true;
    }
    return false;
  }

  await db.insert(catalogLabel).values({
    entityType,
    entityId: entityIdValue,
    locale,
    kind,
    text,
    source: "seed",
  });
  return true;
}

async function upsertCountry(
  db: Db,
  iso: string,
  externalValue: string,
  name: string,
): Promise<{ id: string; created: boolean; labels: number; externalIds: number }> {
  const byExternal = await findEntityId(db, externalValue);
  if (byExternal) {
    const labelChanged = await upsertCatalogLabel(db, "country", byExternal, "en", name);
    return { id: byExternal, created: false, labels: labelChanged ? 1 : 0, externalIds: 0 };
  }

  const byIso = await db
    .select({ id: country.id })
    .from(country)
    .where(eq(country.iso3166, iso))
    .limit(1);
  if (byIso[0]) {
    await linkExternalId(db, "country", byIso[0].id, externalValue);
    const labelChanged = await upsertCatalogLabel(db, "country", byIso[0].id, "en", name);
    return { id: byIso[0].id, created: false, labels: labelChanged ? 1 : 0, externalIds: 1 };
  }

  const [row] = await db
    .insert(country)
    .values({ iso3166: iso, ...countryCodesForIso3166(iso) })
    .returning({ id: country.id });
  // SAFETY: insert … returning always yields the created country row.
  const id = row!.id;
  await linkExternalId(db, "country", id, externalValue);
  await upsertCatalogLabel(db, "country", id, "en", name);
  return { id, created: true, labels: 1, externalIds: 1 };
}

async function upsertLeagueRow(
  db: Db,
  countryId: string,
  externalValue: string,
  name: string,
): Promise<{ id: string; created: boolean; labels: number; externalIds: number }> {
  const byExternal = await findEntityId(db, externalValue);
  if (byExternal) {
    const labelChanged = await upsertCatalogLabel(db, "league", byExternal, "en", name);
    return { id: byExternal, created: false, labels: labelChanged ? 1 : 0, externalIds: 0 };
  }

  const [row] = await db.insert(league).values({ countryId }).returning({ id: league.id });
  const id = row!.id;
  await linkExternalId(db, "league", id, externalValue);
  await upsertCatalogLabel(db, "league", id, "en", name);
  return { id, created: true, labels: 1, externalIds: 1 };
}

async function upsertSeasonRow(
  db: Db,
  leagueId: string,
  seasonData: NormalizedSeason,
): Promise<{ id: string; created: boolean }> {
  const existing = await db
    .select({ id: season.id })
    .from(season)
    .where(and(eq(season.leagueId, leagueId), eq(season.label, seasonData.label)))
    .limit(1);

  if (existing[0]) {
    return { id: existing[0].id, created: false };
  }

  const [row] = await db
    .insert(season)
    .values({
      leagueId,
      label: seasonData.label,
      startsOn: seasonData.startsOn,
      endsOn: seasonData.endsOn,
      calendarKind: seasonData.calendarKind,
    })
    .returning({ id: season.id });

  return { id: row!.id, created: true };
}

function clubFactPatch(clubData: NormalizedClub): {
  foundedOn?: string;
  stadiumName?: string;
  stadiumCapacity?: number;
  primaryColorHex?: string;
  secondaryColorHex?: string;
  websiteUrl?: string;
} {
  const patch: {
    foundedOn?: string;
    stadiumName?: string;
    stadiumCapacity?: number;
    primaryColorHex?: string;
    secondaryColorHex?: string;
    websiteUrl?: string;
  } = {};
  if (clubData.foundedOn !== undefined) {
    patch.foundedOn = clubData.foundedOn;
  }
  if (clubData.stadiumName !== undefined) {
    patch.stadiumName = clubData.stadiumName;
  }
  if (clubData.stadiumCapacity !== undefined) {
    patch.stadiumCapacity = clubData.stadiumCapacity;
  }
  if (clubData.primaryColorHex !== undefined) {
    patch.primaryColorHex = clubData.primaryColorHex;
  }
  if (clubData.secondaryColorHex !== undefined) {
    patch.secondaryColorHex = clubData.secondaryColorHex;
  }
  if (clubData.websiteUrl !== undefined) {
    patch.websiteUrl = clubData.websiteUrl;
  }
  return patch;
}

function playerBodyPatch(
  playerData: NormalizedPlayer,
  primaryCountryId: string | undefined,
): {
  dateOfBirth?: string;
  heightCm?: number;
  preferredFoot?: NormalizedPlayer["preferredFoot"];
  primaryCountryId?: string;
} {
  const patch: {
    dateOfBirth?: string;
    heightCm?: number;
    preferredFoot?: NormalizedPlayer["preferredFoot"];
    primaryCountryId?: string;
  } = {};
  if (playerData.dateOfBirth !== undefined) {
    patch.dateOfBirth = playerData.dateOfBirth;
  }
  if (playerData.heightCm !== undefined) {
    patch.heightCm = playerData.heightCm;
  }
  if (playerData.preferredFoot !== undefined) {
    patch.preferredFoot = playerData.preferredFoot;
  }
  if (primaryCountryId !== undefined) {
    patch.primaryCountryId = primaryCountryId;
  }
  return patch;
}

function playerClubSeasonPatch(
  squadNumber: number | undefined,
  position: string | undefined,
): { squadNumber?: number; position?: string } {
  const patch: { squadNumber?: number; position?: string } = {};
  if (squadNumber !== undefined) {
    patch.squadNumber = squadNumber;
  }
  if (position !== undefined) {
    patch.position = position;
  }
  return patch;
}

async function upsertClubRow(
  db: Db,
  countryId: string,
  clubData: NormalizedClub,
): Promise<{ id: string; created: boolean; labels: number; externalIds: number }> {
  const facts = clubFactPatch(clubData);
  const byExternal = await findEntityId(db, clubData.externalId);
  if (byExternal) {
    if (Object.keys(facts).length > 0) {
      await db.update(club).set(facts).where(eq(club.id, byExternal));
    }
    let labels = (await upsertCatalogLabel(
      db,
      "club",
      byExternal,
      clubData.nameLocale,
      clubData.name,
    ))
      ? 1
      : 0;
    if (clubData.officialName && clubData.officialName !== clubData.name) {
      labels += (await upsertCatalogLabel(
        db,
        "club",
        byExternal,
        clubData.nameLocale,
        clubData.officialName,
        "alias",
      ))
        ? 1
        : 0;
    }
    return { id: byExternal, created: false, labels, externalIds: 0 };
  }

  const [row] = await db
    .insert(club)
    .values({ countryId, kind: clubData.kind, ...clubFactPatch(clubData) })
    .returning({ id: club.id });
  const id = row!.id;
  await linkExternalId(db, "club", id, clubData.externalId);
  let labels = 1;
  await upsertCatalogLabel(db, "club", id, clubData.nameLocale, clubData.name);
  if (clubData.officialName && clubData.officialName !== clubData.name) {
    await upsertCatalogLabel(db, "club", id, clubData.nameLocale, clubData.officialName, "alias");
    labels += 1;
  }
  return { id, created: true, labels, externalIds: 1 };
}

async function upsertTeamSeasonRow(
  db: Db,
  clubId: string,
  seasonId: string,
): Promise<{ id: string; created: boolean }> {
  const existing = await db
    .select({ id: teamSeason.id })
    .from(teamSeason)
    .where(and(eq(teamSeason.clubId, clubId), eq(teamSeason.seasonId, seasonId)))
    .limit(1);

  if (existing[0]) {
    return { id: existing[0].id, created: false };
  }

  const [row] = await db
    .insert(teamSeason)
    .values({ clubId, seasonId })
    .returning({ id: teamSeason.id });

  return { id: row!.id, created: true };
}

async function upsertPlayerRow(
  db: Db,
  playerData: NormalizedPlayer,
  primaryCountryId?: string,
): Promise<{ id: string; created: boolean; labels: number; externalIds: number }> {
  const body = playerBodyPatch(playerData, primaryCountryId);
  const byExternal = await findEntityId(db, playerData.externalId);
  if (byExternal) {
    if (Object.keys(body).length > 0) {
      await db.update(player).set(body).where(eq(player.id, byExternal));
    }
    const labelChanged = await upsertCatalogLabel(
      db,
      "player",
      byExternal,
      playerData.nameLocale,
      playerData.name,
    );
    return { id: byExternal, created: false, labels: labelChanged ? 1 : 0, externalIds: 0 };
  }

  const [row] = await db
    .insert(player)
    .values({
      dateOfBirth: playerData.dateOfBirth,
      heightCm: playerData.heightCm,
      preferredFoot: playerData.preferredFoot,
      primaryCountryId,
    })
    .returning({ id: player.id });
  const id = row!.id;
  await linkExternalId(db, "player", id, playerData.externalId);
  await upsertCatalogLabel(db, "player", id, playerData.nameLocale, playerData.name);
  return { id, created: true, labels: 1, externalIds: 1 };
}

async function upsertPlayerClubSeasonRow(
  db: Db,
  playerId: string,
  clubId: string,
  seasonId: string,
  squadNumber?: number,
  position?: string,
): Promise<{ id: string; created: boolean }> {
  const existing = await db
    .select({
      id: playerClubSeason.id,
      squadNumber: playerClubSeason.squadNumber,
      position: playerClubSeason.position,
    })
    .from(playerClubSeason)
    .where(
      and(
        eq(playerClubSeason.playerId, playerId),
        eq(playerClubSeason.clubId, clubId),
        eq(playerClubSeason.seasonId, seasonId),
      ),
    )
    .limit(1);

  if (existing[0]) {
    const patch = playerClubSeasonPatch(squadNumber, position);
    if (Object.keys(patch).length > 0) {
      await db.update(playerClubSeason).set(patch).where(eq(playerClubSeason.id, existing[0].id));
    }
    return { id: existing[0].id, created: false };
  }

  const [row] = await db
    .insert(playerClubSeason)
    .values({
      playerId,
      clubId,
      seasonId,
      squadNumber: squadNumber ?? null,
      position: position ?? null,
    })
    .returning({ id: playerClubSeason.id });

  return { id: row!.id, created: true };
}

async function upsertHonours(
  db: Db,
  subjectType: "club" | "player",
  subjectId: string,
  rows: NormalizedClub["honours"],
): Promise<number> {
  if (!rows?.length) {
    return 0;
  }
  let created = 0;
  for (const row of rows) {
    const existing = await db
      .select({ id: honour.id, seasonLabel: honour.seasonLabel })
      .from(honour)
      .where(
        and(
          eq(honour.subjectType, subjectType),
          eq(honour.subjectId, subjectId),
          eq(honour.title, row.title),
        ),
      );
    if (
      existing.some(
        (item: { seasonLabel: string | null }) => (item.seasonLabel ?? null) === row.seasonLabel,
      )
    ) {
      continue;
    }
    await db.insert(honour).values({
      subjectType,
      subjectId,
      seasonLabel: row.seasonLabel,
      title: row.title,
      source: "seed",
    });
    created += 1;
  }
  return created;
}

async function upsertPlayerPhoto(
  db: Db,
  playerId: string,
  playerExternalId: string,
  bytes: Uint8Array,
  store: PortraitStore,
): Promise<boolean> {
  const objectKey = `player/${playerExternalId}/portrait`;
  const existing = await db
    .select({ id: playerPhoto.id })
    .from(playerPhoto)
    .where(eq(playerPhoto.playerId, playerId))
    .limit(1);
  await store.putObject(objectKey, bytes);
  if (existing[0]) {
    await db.update(playerPhoto).set({ objectKey }).where(eq(playerPhoto.id, existing[0].id));
    return false;
  }
  await db.insert(playerPhoto).values({
    playerId,
    objectKey,
    rights: "unresolved",
    visibility: "admin_only",
  });
  return true;
}

function emptyMapResult(): MapResult {
  return {
    countries: 0,
    leagues: 0,
    seasons: 0,
    clubs: 0,
    teamSeasons: 0,
    players: 0,
    playerClubSeasons: 0,
    catalogLabels: 0,
    externalIds: 0,
    honours: 0,
    playerPhotos: 0,
  };
}

async function mapOneClub(
  db: Db,
  result: MapResult,
  leagueCountryId: string,
  leagueCountryIso: string,
  clubData: NormalizedClub,
): Promise<string> {
  let countryId = leagueCountryId;
  const clubIso = clubData.countryIso?.toUpperCase();
  if (clubIso && clubIso !== leagueCountryIso.toUpperCase()) {
    const countryResult = await upsertCountry(
      db,
      clubData.countryIso,
      `country-${clubData.countryIso.toLowerCase()}`,
      clubData.countryName ?? clubData.countryIso,
    );
    if (countryResult.created) result.countries += 1;
    result.catalogLabels += countryResult.labels;
    result.externalIds += countryResult.externalIds;
    countryId = countryResult.id;
  }

  const clubResult = await upsertClubRow(db, countryId, clubData);
  if (clubResult.created) result.clubs += 1;
  result.catalogLabels += clubResult.labels;
  result.externalIds += clubResult.externalIds;
  result.honours += await upsertHonours(db, "club", clubResult.id, clubData.honours);
  return clubResult.id;
}

async function mapOnePlayer(
  db: Db,
  result: MapResult,
  clubId: string,
  seasonId: string | undefined,
  playerData: NormalizedPlayer,
  options?: MapFactsOptions,
): Promise<void> {
  let primaryCountryId: string | undefined;
  if (playerData.nationalityIso) {
    const nationality = await upsertCountry(
      db,
      playerData.nationalityIso,
      `country-${playerData.nationalityIso.toLowerCase()}`,
      playerData.nationalityName ?? playerData.nationalityIso,
    );
    if (nationality.created) result.countries += 1;
    result.catalogLabels += nationality.labels;
    result.externalIds += nationality.externalIds;
    primaryCountryId = nationality.id;
  }

  const playerResult = await upsertPlayerRow(db, playerData, primaryCountryId);
  if (playerResult.created) result.players += 1;
  result.catalogLabels += playerResult.labels;
  result.externalIds += playerResult.externalIds;

  if (seasonId) {
    const pcsResult = await upsertPlayerClubSeasonRow(
      db,
      playerResult.id,
      clubId,
      seasonId,
      playerData.squadNumber,
      playerData.position,
    );
    if (pcsResult.created) result.playerClubSeasons += 1;
  }

  if (playerData.portraitBytes && options?.portraitStore) {
    const created = await upsertPlayerPhoto(
      db,
      playerResult.id,
      playerData.externalId,
      playerData.portraitBytes,
      options.portraitStore,
    );
    if (created) result.playerPhotos += 1;
  }
}

export async function mapFacts(
  db: Db,
  facts: NormalizedFacts,
  options?: MapFactsOptions,
): Promise<MapResult> {
  const depth: MapDepth = options?.depth ?? "full";

  if (options?.allowedSeasonLabels) {
    assertFactsSeasonScope(
      facts.seasons.map((seasonData) => seasonData.label),
      options.allowedSeasonLabels,
    );
  }

  const result = emptyMapResult();

  const countryResult = await upsertCountry(
    db,
    facts.league.countryIso,
    facts.league.countryExternalId,
    facts.league.countryName,
  );
  if (countryResult.created) result.countries += 1;
  result.catalogLabels += countryResult.labels;
  result.externalIds += countryResult.externalIds;

  const leagueResult = await upsertLeagueRow(
    db,
    countryResult.id,
    facts.league.externalId,
    facts.league.name,
  );
  if (leagueResult.created) result.leagues += 1;
  result.catalogLabels += leagueResult.labels;
  result.externalIds += leagueResult.externalIds;

  if (depth === "league") {
    return result;
  }

  if (depth === "club") {
    for (const clubData of facts.clubs ?? []) {
      await mapOneClub(db, result, countryResult.id, facts.league.countryIso, clubData);
    }
    return result;
  }

  for (const seasonData of facts.seasons) {
    const seasonResult = await upsertSeasonRow(db, leagueResult.id, seasonData);
    if (seasonResult.created) result.seasons += 1;

    for (const clubData of seasonData.clubs) {
      const clubId = await mapOneClub(
        db,
        result,
        countryResult.id,
        facts.league.countryIso,
        clubData,
      );

      const teamSeasonResult = await upsertTeamSeasonRow(db, clubId, seasonResult.id);
      if (teamSeasonResult.created) result.teamSeasons += 1;

      if (depth === "league_season") {
        continue;
      }

      for (const playerData of clubData.players) {
        await mapOnePlayer(db, result, clubId, seasonResult.id, playerData, options);
      }
    }
  }

  return result;
}
