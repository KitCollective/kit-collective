import {
  catalogLabel,
  catalogMark,
  club,
  country,
  type Db,
  externalId,
  honour,
  league,
  nationalTeam,
  nationalTeamSeason,
  player,
  playerClubSeason,
  playerJerseyNumber,
  playerNationality,
  playerNationalTeamSeason,
  playerPhoto,
  season,
  teamSeason,
} from "@kit/db";
import {
  type CatalogEntityType,
  type CatalogMarkEntityType,
  countryCodesForIso3166,
  type LabelLocale,
} from "@kit/domain";
import { and, eq, isNull } from "drizzle-orm";
import { assertFactsSeasonScope } from "../scope-isolation.js";
import type {
  MapResult,
  NormalizedClub,
  NormalizedFacts,
  NormalizedNationality,
  NormalizedNationalTeam,
  NormalizedPlayer,
  NormalizedPlayerJerseyNumbers,
  NormalizedSeason,
} from "../types.js";
import { TM_SYSTEM } from "../types.js";
import { clubCrestObjectKey, leagueBadgeObjectKey } from "../catalog-mark-cdn.js";

export type MapDepth =
  | "league"
  | "league_season"
  | "club"
  | "full"
  | "national_team"
  | "national_team_season";

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

async function findEntity(
  db: Db,
  value: string,
): Promise<{ entityId: string; entityType: string } | undefined> {
  const row = await db
    .select({ entityId: externalId.entityId, entityType: externalId.entityType })
    .from(externalId)
    .where(and(eq(externalId.system, TM_SYSTEM), eq(externalId.value, value)))
    .limit(1);

  return row[0];
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
  leagueId: string | null,
  seasonData: NormalizedSeason,
): Promise<{ id: string; created: boolean }> {
  const existing = leagueId
    ? await db
        .select({ id: season.id })
        .from(season)
        .where(and(eq(season.leagueId, leagueId), eq(season.label, seasonData.label)))
        .limit(1)
    : await db
        .select({ id: season.id })
        .from(season)
        .where(and(isNull(season.leagueId), eq(season.label, seasonData.label)))
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
  placeOfBirth?: string;
  heightCm?: number;
  preferredFoot?: NormalizedPlayer["preferredFoot"];
  primaryCountryId?: string;
} {
  const patch: {
    dateOfBirth?: string;
    placeOfBirth?: string;
    heightCm?: number;
    preferredFoot?: NormalizedPlayer["preferredFoot"];
    primaryCountryId?: string;
  } = {};
  if (playerData.dateOfBirth !== undefined) {
    patch.dateOfBirth = playerData.dateOfBirth;
  }
  if (playerData.placeOfBirth !== undefined) {
    patch.placeOfBirth = playerData.placeOfBirth;
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

async function existingLabelText(
  db: Db,
  entityType: CatalogEntityType,
  entityIdValue: string,
  locale: LabelLocale,
): Promise<string | undefined> {
  const row = await db
    .select({ text: catalogLabel.text })
    .from(catalogLabel)
    .where(
      and(
        eq(catalogLabel.entityType, entityType),
        eq(catalogLabel.entityId, entityIdValue),
        eq(catalogLabel.locale, locale),
        eq(catalogLabel.kind, "label"),
      ),
    )
    .limit(1);
  return row[0]?.text;
}

/**
 * One display `label` per club and locale; the official name is always an `alias`.
 *
 * The Club grain passes the official name as the display name because the honours and
 * facts pages carry nothing shorter. Overwriting the label with it would flip-flop the
 * collector-facing name between grains, so a fallback name yields to a stored label and
 * lands as the alias instead.
 */
async function upsertClubLabels(
  db: Db,
  clubIdValue: string,
  clubData: NormalizedClub,
): Promise<number> {
  const stored = await existingLabelText(db, "club", clubIdValue, clubData.nameLocale);
  const yieldToStored = Boolean(clubData.nameIsOfficialFallback && stored);
  const displayName = yieldToStored ? stored : clubData.name;

  let labels = 0;
  if (
    !yieldToStored &&
    (await upsertCatalogLabel(db, "club", clubIdValue, clubData.nameLocale, clubData.name))
  ) {
    labels += 1;
  }

  if (clubData.officialName && clubData.officialName !== displayName) {
    if (
      await upsertCatalogLabel(
        db,
        "club",
        clubIdValue,
        clubData.nameLocale,
        clubData.officialName,
        "alias",
      )
    ) {
      labels += 1;
    }
  }

  return labels;
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
    const labels = await upsertClubLabels(db, byExternal, clubData);
    return { id: byExternal, created: false, labels, externalIds: 0 };
  }

  const [row] = await db
    .insert(club)
    .values({ countryId, kind: clubData.kind, ...clubFactPatch(clubData) })
    .returning({ id: club.id });
  const id = row!.id;
  await linkExternalId(db, "club", id, clubData.externalId);
  const labels = await upsertClubLabels(db, id, clubData);
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

interface ResolvedNationality {
  countryId: string;
  sortOrder: number;
}

/**
 * Citizenships in source order, primary first.
 *
 * `nationalityIso` is the one `player.primary_country_id` points at, so it always leads:
 * a squad row and the profile page it was merged with can disagree about the full list,
 * and slot 0 must stay the primary citizenship. Payloads that carry only the primary
 * (recorded fixtures, the FK grains) still yield exactly one entry.
 */
function playerNationalityList(playerData: NormalizedPlayer): NormalizedNationality[] {
  const listed = playerData.nationalities ?? [];
  const primaryIso = playerData.nationalityIso;
  if (!primaryIso) {
    return listed;
  }
  const secondary = listed.filter((row) => row.iso?.toUpperCase() !== primaryIso.toUpperCase());
  return [{ name: playerData.nationalityName ?? primaryIso, iso: primaryIso }, ...secondary];
}

/**
 * Upsert one Country per citizenship, keeping the source order as `sortOrder`.
 *
 * A citizenship whose flag did not resolve to an ISO code has no Country to link and is
 * dropped, so `sortOrder` can skip a slot rather than renumber the ones that resolved.
 */
async function resolvePlayerNationalities(
  db: Db,
  result: MapResult,
  playerData: NormalizedPlayer,
): Promise<ResolvedNationality[]> {
  const resolved: ResolvedNationality[] = [];
  const seenCountryIds = new Set<string>();

  for (const [sortOrder, nationality] of playerNationalityList(playerData).entries()) {
    if (!nationality.iso) {
      continue;
    }
    const countryResult = await upsertCountry(
      db,
      nationality.iso,
      `country-${nationality.iso.toLowerCase()}`,
      nationality.name || nationality.iso,
    );
    if (countryResult.created) result.countries += 1;
    result.catalogLabels += countryResult.labels;
    result.externalIds += countryResult.externalIds;

    if (seenCountryIds.has(countryResult.id)) {
      continue;
    }
    seenCountryIds.add(countryResult.id);
    resolved.push({ countryId: countryResult.id, sortOrder });
  }

  return resolved;
}

async function upsertPlayerNationalityRows(
  db: Db,
  playerId: string,
  nationalities: readonly ResolvedNationality[],
): Promise<void> {
  for (const nationality of nationalities) {
    const existing = await db
      .select({ id: playerNationality.id, sortOrder: playerNationality.sortOrder })
      .from(playerNationality)
      .where(
        and(
          eq(playerNationality.playerId, playerId),
          eq(playerNationality.countryId, nationality.countryId),
        ),
      )
      .limit(1);

    if (existing[0]) {
      if (existing[0].sortOrder !== nationality.sortOrder) {
        await db
          .update(playerNationality)
          .set({ sortOrder: nationality.sortOrder })
          .where(eq(playerNationality.id, existing[0].id));
      }
      continue;
    }

    await db.insert(playerNationality).values({
      playerId,
      countryId: nationality.countryId,
      sortOrder: nationality.sortOrder,
    });
  }
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
    let labels = (await upsertCatalogLabel(
      db,
      "player",
      byExternal,
      playerData.nameLocale,
      playerData.name,
    ))
      ? 1
      : 0;
    labels += await upsertFullNameAlias(db, byExternal, playerData);
    return { id: byExternal, created: false, labels, externalIds: 0 };
  }

  const [row] = await db
    .insert(player)
    .values({
      dateOfBirth: playerData.dateOfBirth,
      placeOfBirth: playerData.placeOfBirth,
      heightCm: playerData.heightCm,
      preferredFoot: playerData.preferredFoot,
      primaryCountryId,
    })
    .returning({ id: player.id });
  const id = row!.id;
  await linkExternalId(db, "player", id, playerData.externalId);
  await upsertCatalogLabel(db, "player", id, playerData.nameLocale, playerData.name);
  const aliases = await upsertFullNameAlias(db, id, playerData);
  return { id, created: true, labels: 1 + aliases, externalIds: 1 };
}

/** The profile page's full name is an alias, never the display label. */
async function upsertFullNameAlias(
  db: Db,
  playerIdValue: string,
  playerData: NormalizedPlayer,
): Promise<number> {
  if (!playerData.fullName || playerData.fullName === playerData.name) {
    return 0;
  }
  const created = await upsertCatalogLabel(
    db,
    "player",
    playerIdValue,
    playerData.fullNameLocale ?? playerData.nameLocale,
    playerData.fullName,
    "alias",
  );
  return created ? 1 : 0;
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

async function upsertCatalogMark(
  db: Db,
  entityType: CatalogMarkEntityType,
  entityId: string,
  objectKey: string,
  bytes: Uint8Array,
  store: PortraitStore,
): Promise<boolean> {
  const existing = await db
    .select({ id: catalogMark.id })
    .from(catalogMark)
    .where(and(eq(catalogMark.entityType, entityType), eq(catalogMark.entityId, entityId)))
    .limit(1);
  await store.putObject(objectKey, bytes);
  if (existing[0]) {
    await db.update(catalogMark).set({ objectKey }).where(eq(catalogMark.id, existing[0].id));
    return false;
  }
  await db.insert(catalogMark).values({
    entityType,
    entityId,
    objectKey,
    rights: "unresolved",
    visibility: "admin_only",
  });
  return true;
}

async function upsertHonours(
  db: Db,
  subjectType: "club" | "national_team" | "player",
  subjectId: string,
  rows: NormalizedClub["honours"],
  store?: PortraitStore,
): Promise<{ honours: number; marks: number }> {
  if (!rows?.length) {
    return { honours: 0, marks: 0 };
  }
  let created = 0;
  let marks = 0;
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
    const match = existing.find(
      (item: { id: string; seasonLabel: string | null }) =>
        (item.seasonLabel ?? null) === row.seasonLabel,
    );
    let honourId: string;
    if (match) {
      honourId = match.id;
    } else {
      const [inserted] = await db
        .insert(honour)
        .values({
          subjectType,
          subjectId,
          seasonLabel: row.seasonLabel,
          title: row.title,
          source: "seed",
        })
        .returning({ id: honour.id });
      honourId = inserted!.id;
      created += 1;
    }
    if (row.markBytes && row.markObjectKey && store) {
      const createdMark = await upsertCatalogMark(
        db,
        "honour",
        honourId,
        row.markObjectKey,
        row.markBytes,
        store,
      );
      if (createdMark) {
        marks += 1;
      }
    }
  }
  return { honours: created, marks };
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

export interface JerseyNumberMapResult {
  /** False when the lane holds no player for that Transfermarkt id — nothing was written. */
  playerFound: boolean;
  parsedRows: number;
  created: number;
  /** Rows the unique index already held. A second run over the same player is all `existing`. */
  existing: number;
  clubLinked: number;
  nationalTeamLinked: number;
  /** Rows whose side is not seeded: `side_external_id` kept, both FKs null. */
  sideUnresolved: number;
  seasonLinked: number;
  missingNumber: number;
  /** Page called the side a national team but our `external_id` says club, or the reverse. */
  sideKindMismatch: number;
}

function emptyJerseyNumberMapResult(): JerseyNumberMapResult {
  return {
    playerFound: false,
    parsedRows: 0,
    created: 0,
    existing: 0,
    clubLinked: 0,
    nationalTeamLinked: 0,
    sideUnresolved: 0,
    seasonLinked: 0,
    missingNumber: 0,
    sideKindMismatch: 0,
  };
}

/**
 * The `season` row this career row belongs to, or `undefined`.
 *
 * `season.label` is not unique — one label exists per seeded league — so the label alone
 * cannot pick a row. The side's own season membership disambiguates: a club season is the
 * one that club has a `team_season` for, a national side the one it has a
 * `national_team_season` for. No membership means the season stays unresolved and only
 * `season_label` carries the season.
 */
async function findSideSeasonId(
  db: Db,
  side: { kind: "club" | "national_team"; id: string },
  seasonLabel: string,
): Promise<string | undefined> {
  if (side.kind === "club") {
    const rows = await db
      .select({ id: season.id })
      .from(season)
      .innerJoin(teamSeason, eq(teamSeason.seasonId, season.id))
      .where(and(eq(season.label, seasonLabel), eq(teamSeason.clubId, side.id)))
      .limit(1);
    return rows[0]?.id;
  }

  const rows = await db
    .select({ id: season.id })
    .from(season)
    .innerJoin(nationalTeamSeason, eq(nationalTeamSeason.seasonId, season.id))
    .where(and(eq(season.label, seasonLabel), eq(nationalTeamSeason.nationalTeamId, side.id)))
    .limit(1);
  return rows[0]?.id;
}

/**
 * Persist one player's career squad-number history.
 *
 * Idempotent through the `player_jersey_number` unique index: a repeat run conflicts on
 * every row and creates none. A row whose club or national side is not seeded still lands
 * — `side_external_id` keeps the vendor identity so a later run can attach the FK — because
 * a career page names far more sides than a lane holds.
 */
export async function mapPlayerJerseyNumbers(
  db: Db,
  history: NormalizedPlayerJerseyNumbers,
): Promise<JerseyNumberMapResult> {
  const result = emptyJerseyNumberMapResult();
  result.parsedRows = history.rows.length;

  const playerEntity = await findEntity(db, history.playerExternalId);
  if (!playerEntity || playerEntity.entityType !== "player") {
    return result;
  }
  result.playerFound = true;

  const sideCache = new Map<string, { kind: "club" | "national_team"; id: string } | null>();

  for (const row of history.rows) {
    if (row.squadNumber === null) {
      result.missingNumber += 1;
    }

    let side = sideCache.get(row.sideExternalId);
    if (side === undefined) {
      const entity = await findEntity(db, row.sideExternalId);
      side =
        entity?.entityType === "club" || entity?.entityType === "national_team"
          ? { kind: entity.entityType, id: entity.entityId }
          : null;
      sideCache.set(row.sideExternalId, side);
    }

    if (!side) {
      result.sideUnresolved += 1;
    } else {
      if (side.kind !== row.side) {
        result.sideKindMismatch += 1;
      }
      if (side.kind === "club") {
        result.clubLinked += 1;
      } else {
        result.nationalTeamLinked += 1;
      }
    }

    const seasonId = side ? await findSideSeasonId(db, side, row.seasonLabel) : undefined;
    if (seasonId) {
      result.seasonLinked += 1;
    }

    const inserted = await db
      .insert(playerJerseyNumber)
      .values({
        playerId: playerEntity.entityId,
        seasonId: seasonId ?? null,
        seasonLabel: row.seasonLabel,
        clubId: side?.kind === "club" ? side.id : null,
        nationalTeamId: side?.kind === "national_team" ? side.id : null,
        sideExternalId: row.sideExternalId,
        sideName: row.sideName ?? null,
        squadNumber: row.squadNumber,
      })
      .onConflictDoNothing()
      .returning({ id: playerJerseyNumber.id });

    if (inserted.length > 0) {
      result.created += 1;
    } else {
      result.existing += 1;
    }
  }

  return result;
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
    catalogMarks: 0,
    nationalTeams: 0,
    nationalTeamSeasons: 0,
    playerNationalTeamSeasons: 0,
  };
}

async function mapOneClub(
  db: Db,
  result: MapResult,
  leagueCountryId: string,
  leagueCountryIso: string,
  clubData: NormalizedClub,
  options?: MapFactsOptions,
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
  const honourResult = await upsertHonours(
    db,
    "club",
    clubResult.id,
    clubData.honours,
    options?.portraitStore,
  );
  result.honours += honourResult.honours;
  result.catalogMarks += honourResult.marks;
  if (clubData.crestBytes && options?.portraitStore) {
    const createdMark = await upsertCatalogMark(
      db,
      "club",
      clubResult.id,
      clubCrestObjectKey(clubData.externalId),
      clubData.crestBytes,
      options.portraitStore,
    );
    if (createdMark) {
      result.catalogMarks += 1;
    }
  }
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
  const nationalities = await resolvePlayerNationalities(db, result, playerData);

  const playerResult = await upsertPlayerRow(db, playerData, nationalities[0]?.countryId);
  if (playerResult.created) result.players += 1;
  result.catalogLabels += playerResult.labels;
  result.externalIds += playerResult.externalIds;
  await upsertPlayerNationalityRows(db, playerResult.id, nationalities);

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
  if (facts.league.badgeBytes && options?.portraitStore) {
    const createdMark = await upsertCatalogMark(
      db,
      "league",
      leagueResult.id,
      leagueBadgeObjectKey(facts.league.externalId),
      facts.league.badgeBytes,
      options.portraitStore,
    );
    if (createdMark) {
      result.catalogMarks += 1;
    }
  }

  if (depth === "league") {
    return result;
  }

  if (depth === "club") {
    for (const clubData of facts.clubs ?? []) {
      await mapOneClub(db, result, countryResult.id, facts.league.countryIso, clubData, options);
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
        options,
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

function nationalTeamFactPatch(teamData: NormalizedNationalTeam): {
  foundedOn?: string;
  confederation?: string;
} {
  const patch: { foundedOn?: string; confederation?: string } = {};
  if (teamData.foundedOn !== undefined) {
    patch.foundedOn = teamData.foundedOn;
  }
  if (teamData.confederation !== undefined) {
    patch.confederation = teamData.confederation;
  }
  return patch;
}

async function upsertNationalTeamRow(
  db: Db,
  countryId: string,
  teamData: NormalizedNationalTeam,
): Promise<{ id: string; created: boolean; labels: number; externalIds: number }> {
  const facts = nationalTeamFactPatch(teamData);
  const byExternal = await findEntityId(db, teamData.externalId);
  if (byExternal) {
    if (Object.keys(facts).length > 0) {
      await db.update(nationalTeam).set(facts).where(eq(nationalTeam.id, byExternal));
    }
    let labels = (await upsertCatalogLabel(
      db,
      "national_team",
      byExternal,
      teamData.nameLocale,
      teamData.name,
    ))
      ? 1
      : 0;
    if (teamData.officialName && teamData.officialName !== teamData.name) {
      labels += (await upsertCatalogLabel(
        db,
        "national_team",
        byExternal,
        teamData.nameLocale,
        teamData.officialName,
        "alias",
      ))
        ? 1
        : 0;
    }
    return { id: byExternal, created: false, labels, externalIds: 0 };
  }

  const [row] = await db
    .insert(nationalTeam)
    .values({ countryId, gender: teamData.gender, ...nationalTeamFactPatch(teamData) })
    .returning({ id: nationalTeam.id });
  const id = row!.id;
  await linkExternalId(db, "national_team", id, teamData.externalId);
  let labels = 1;
  await upsertCatalogLabel(db, "national_team", id, teamData.nameLocale, teamData.name);
  if (teamData.officialName && teamData.officialName !== teamData.name) {
    await upsertCatalogLabel(
      db,
      "national_team",
      id,
      teamData.nameLocale,
      teamData.officialName,
      "alias",
    );
    labels += 1;
  }
  return { id, created: true, labels, externalIds: 1 };
}

async function upsertNationalTeamSeasonRow(
  db: Db,
  nationalTeamId: string,
  seasonId: string,
): Promise<{ id: string; created: boolean }> {
  const existing = await db
    .select({ id: nationalTeamSeason.id })
    .from(nationalTeamSeason)
    .where(
      and(
        eq(nationalTeamSeason.nationalTeamId, nationalTeamId),
        eq(nationalTeamSeason.seasonId, seasonId),
      ),
    )
    .limit(1);

  if (existing[0]) {
    return { id: existing[0].id, created: false };
  }

  const [row] = await db
    .insert(nationalTeamSeason)
    .values({ nationalTeamId, seasonId })
    .returning({ id: nationalTeamSeason.id });

  return { id: row!.id, created: true };
}

async function upsertPlayerNationalTeamSeasonRow(
  db: Db,
  playerId: string,
  nationalTeamId: string,
  seasonId: string,
  squadNumber?: number,
  position?: string,
  callUpClubId?: string,
): Promise<{ id: string; created: boolean }> {
  const existing = await db
    .select({
      id: playerNationalTeamSeason.id,
      squadNumber: playerNationalTeamSeason.squadNumber,
      position: playerNationalTeamSeason.position,
      callUpClubId: playerNationalTeamSeason.callUpClubId,
    })
    .from(playerNationalTeamSeason)
    .where(
      and(
        eq(playerNationalTeamSeason.playerId, playerId),
        eq(playerNationalTeamSeason.nationalTeamId, nationalTeamId),
        eq(playerNationalTeamSeason.seasonId, seasonId),
      ),
    )
    .limit(1);

  const patch: {
    squadNumber?: number;
    position?: string;
    callUpClubId?: string;
  } = {};
  if (squadNumber !== undefined) {
    patch.squadNumber = squadNumber;
  }
  if (position !== undefined) {
    patch.position = position;
  }
  if (callUpClubId !== undefined) {
    patch.callUpClubId = callUpClubId;
  }

  if (existing[0]) {
    if (Object.keys(patch).length > 0) {
      await db
        .update(playerNationalTeamSeason)
        .set(patch)
        .where(eq(playerNationalTeamSeason.id, existing[0].id));
    }
    return { id: existing[0].id, created: false };
  }

  const [row] = await db
    .insert(playerNationalTeamSeason)
    .values({
      playerId,
      nationalTeamId,
      seasonId,
      squadNumber: squadNumber ?? null,
      position: position ?? null,
      callUpClubId: callUpClubId ?? null,
    })
    .returning({ id: playerNationalTeamSeason.id });

  return { id: row!.id, created: true };
}

async function mapOneNationalTeam(
  db: Db,
  result: MapResult,
  countryId: string,
  teamData: NormalizedNationalTeam,
  options?: MapFactsOptions,
): Promise<string> {
  const teamResult = await upsertNationalTeamRow(db, countryId, teamData);
  if (teamResult.created) result.nationalTeams += 1;
  result.catalogLabels += teamResult.labels;
  result.externalIds += teamResult.externalIds;
  const honourResult = await upsertHonours(
    db,
    "national_team",
    teamResult.id,
    teamData.honours,
    options?.portraitStore,
  );
  result.honours += honourResult.honours;
  result.catalogMarks += honourResult.marks;
  return teamResult.id;
}

async function mapOneNationalTeamPlayer(
  db: Db,
  result: MapResult,
  nationalTeamId: string,
  seasonId: string | undefined,
  playerData: NormalizedPlayer,
  options?: MapFactsOptions,
): Promise<void> {
  const nationalities = await resolvePlayerNationalities(db, result, playerData);

  let callUpClubId: string | undefined;
  if (playerData.callUpClubExternalId) {
    const existingClubId = await findEntityId(db, playerData.callUpClubExternalId);
    if (existingClubId) {
      callUpClubId = existingClubId;
    }
  }

  const playerResult = await upsertPlayerRow(db, playerData, nationalities[0]?.countryId);
  if (playerResult.created) result.players += 1;
  result.catalogLabels += playerResult.labels;
  result.externalIds += playerResult.externalIds;
  await upsertPlayerNationalityRows(db, playerResult.id, nationalities);

  if (seasonId) {
    const pntsResult = await upsertPlayerNationalTeamSeasonRow(
      db,
      playerResult.id,
      nationalTeamId,
      seasonId,
      playerData.squadNumber,
      playerData.position,
      callUpClubId,
    );
    if (pntsResult.created) result.playerNationalTeamSeasons += 1;
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

export async function mapNationalTeamFacts(
  db: Db,
  facts: NormalizedFacts,
  options?: MapFactsOptions,
): Promise<MapResult> {
  const depth: MapDepth = options?.depth ?? "national_team_season";

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

  if (depth === "national_team") {
    for (const teamData of facts.nationalTeams ?? []) {
      await mapOneNationalTeam(db, result, countryResult.id, teamData, options);
    }
    return result;
  }

  for (const seasonData of facts.seasons) {
    const seasonResult = await upsertSeasonRow(db, null, seasonData);
    if (seasonResult.created) result.seasons += 1;

    for (const teamData of seasonData.nationalTeams) {
      const nationalTeamId = await mapOneNationalTeam(
        db,
        result,
        countryResult.id,
        teamData,
        options,
      );

      const ntsResult = await upsertNationalTeamSeasonRow(db, nationalTeamId, seasonResult.id);
      if (ntsResult.created) result.nationalTeamSeasons += 1;

      for (const playerData of teamData.players) {
        await mapOneNationalTeamPlayer(
          db,
          result,
          nationalTeamId,
          seasonResult.id,
          playerData,
          options,
        );
      }
    }
  }

  return result;
}
