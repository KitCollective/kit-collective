import {
  type AdminClubDrill,
  type AdminClubSeasonDrill,
  type AdminClubSeasonKitsFetch,
  type AdminFilterOptions,
  type AdminKitDrill,
  type AdminLeagueDrill,
  type AdminPlayerDrill,
  type AdminSeasonDrill,
  type AdminStamdataList,
  type AdminStamdataQuery,
  type AdminStamdataRow,
  adminClubDrillSchema,
  adminClubSeasonDrillSchema,
  adminFilterOptionsSchema,
  adminKitDrillSchema,
  adminLeagueDrillSchema,
  adminPlayerDrillSchema,
  adminSeasonDrillSchema,
  adminStamdataListSchema,
} from "@kit/api-contract";
import type { Db } from "@kit/db";
import {
  catalogLabel,
  catalogMark,
  club,
  country,
  externalId,
  honour,
  kit,
  kitPhoto,
  league,
  player,
  playerClubSeason,
  playerPhoto,
  season,
  teamSeason,
} from "@kit/db";
import { compareSquadOrder, KIT_TYPES } from "@kit/domain";
import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  type SQL,
  type SQLWrapper,
  sql,
} from "drizzle-orm";
import type { ObjectStoreAdapter } from "../collection/object-store.js";
import { createMemoryObjectStore } from "../collection/object-store.js";
import { createR2ObjectStore } from "../collection/r2-object-store.js";
import { DB } from "../db/db.module.js";
import { FK_LISTING_INGEST, type FkListingIngestClient } from "./fk-listing-ingest.js";
import { isOccasionNestedUnderTypeDefault, matchCompetitionLinks } from "./kit-variant-nest.js";

export const ADMIN_OBJECT_STORE = Symbol("ADMIN_OBJECT_STORE");

function hasR2Config(): boolean {
  return Boolean(
    process.env.R2_ENDPOINT &&
      process.env.R2_BUCKET &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY,
  );
}

function monogramFromLabel(label: string): string {
  const words = label
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  if (words.length === 0) {
    return "?";
  }
  if (words.length === 1) {
    return (words[0] ?? "?").slice(0, 2).toUpperCase();
  }
  return words
    .slice(0, 2)
    .map((word) => (word[0] ?? "?").toUpperCase())
    .join("");
}

const resolvedEnLabel = sql<string | null>`coalesce(
  max(case when ${catalogLabel.locale} = 'en' and ${catalogLabel.kind} = 'label' then ${catalogLabel.text} end),
  max(case when ${catalogLabel.locale} = 'mul' and ${catalogLabel.kind} = 'label' then ${catalogLabel.text} end)
)`;

function dateOnly(value: unknown): string | undefined {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return undefined;
}

const DEFAULT_PAGE_SIZE = 50;

function sniffImageContentType(bytes: Uint8Array): string {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return "image/jpeg";
  }
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return "application/octet-stream";
}

function clubMarkPath(clubId: string): string {
  return `/admin/catalog/clubs/${clubId}/mark`;
}

function leagueMarkPath(leagueId: string): string {
  return `/admin/catalog/leagues/${leagueId}/mark`;
}

function honourMarkPath(honourId: string): string {
  return `/admin/catalog/honours/${honourId}/mark`;
}

function playerPhotoPath(playerId: string): string {
  return `/admin/catalog/players/${playerId}/photo`;
}

function pageLimit(query: AdminStamdataQuery): number {
  return query.limit ?? DEFAULT_PAGE_SIZE;
}

function pageOffset(query: AdminStamdataQuery): number {
  return query.offset ?? 0;
}

function countryLabelSubquery(entityIdColumn: SQLWrapper) {
  return sql<string | null>`(
    select coalesce(
      max(case when country_label.locale = 'en' and country_label.kind = 'label' then country_label.text end),
      max(case when country_label.locale = 'mul' and country_label.kind = 'label' then country_label.text end)
    )
    from catalog_label as country_label
    where country_label.entity_type = 'country'
      and country_label.entity_id = ${entityIdColumn}
  )`;
}

@Injectable()
export class AdminCatalogService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ADMIN_OBJECT_STORE) private readonly objectStore: ObjectStoreAdapter,
    @Inject(FK_LISTING_INGEST) private readonly fkListingIngest: FkListingIngestClient,
  ) {}

  static objectStoreFactory(): ObjectStoreAdapter {
    if (hasR2Config()) {
      return createR2ObjectStore();
    }
    return createMemoryObjectStore();
  }

  async listStamdata(query: AdminStamdataQuery): Promise<AdminStamdataList> {
    const searchPattern = query.q ? `%${query.q}%` : null;
    const entityType = query.entityType ?? "club";

    if (entityType === "league") {
      return this.listLeaguePage(query, searchPattern);
    }
    if (entityType === "player") {
      return this.listPlayerPage(query, searchPattern);
    }
    return this.listClubPage(query, searchPattern);
  }

  async getFilterOptions(): Promise<AdminFilterOptions> {
    const countries = await this.db
      .select({
        id: country.id,
        label: resolvedEnLabel,
      })
      .from(country)
      .leftJoin(
        catalogLabel,
        and(eq(catalogLabel.entityType, "country"), eq(catalogLabel.entityId, country.id)),
      )
      .groupBy(country.id)
      .orderBy(asc(country.iso3166));

    const leagues = await this.db
      .select({
        id: league.id,
        label: resolvedEnLabel,
      })
      .from(league)
      .leftJoin(
        catalogLabel,
        and(eq(catalogLabel.entityType, "league"), eq(catalogLabel.entityId, league.id)),
      )
      .groupBy(league.id)
      .orderBy(asc(league.id));

    const seasons = await this.db
      .select({
        id: season.id,
        label: season.label,
      })
      .from(season)
      .orderBy(desc(season.startsOn));

    return adminFilterOptionsSchema.parse({
      countries: countries
        .filter((row): row is typeof row & { label: string } => Boolean(row.label))
        .map((row) => ({ id: row.id, label: row.label })),
      leagues: leagues
        .filter((row): row is typeof row & { label: string } => Boolean(row.label))
        .map((row) => ({ id: row.id, label: row.label })),
      seasons: seasons.map((row) => ({ id: row.id, label: row.label })),
      kitTypes: [...KIT_TYPES],
    });
  }

  async getKitDrill(kitId: string): Promise<AdminKitDrill> {
    const [row] = await this.db
      .select({
        id: kit.id,
        kitType: kit.type,
        variant: kit.variant,
        clubId: kit.clubId,
        manufacturerId: kit.manufacturerId,
        sponsorName: kit.sponsorName,
        design: kit.design,
        colorNames: kit.colorNames,
        primaryColorHex: kit.primaryColorHex,
        secondaryColorHex: kit.secondaryColorHex,
        competition: kit.competition,
        releasedOn: kit.releasedOn,
        description: kit.description,
        seasonId: kit.seasonId,
        seasonLabel: season.label,
      })
      .from(kit)
      .innerJoin(season, eq(kit.seasonId, season.id))
      .where(eq(kit.id, kitId))
      .limit(1);

    if (!row) {
      throw new NotFoundException("Kit not found");
    }

    const clubLabel = row.clubId ? await this.entityLabel("club", row.clubId) : undefined;
    const clubMarkPath = row.clubId
      ? (await this.catalogMarkPaths("club", [row.clubId])).get(row.clubId)
      : undefined;
    const brandLabel = row.manufacturerId
      ? await this.entityLabel("manufacturer", row.manufacturerId)
      : undefined;
    const photos = await this.db
      .select({ id: kitPhoto.id })
      .from(kitPhoto)
      .where(eq(kitPhoto.kitId, kitId))
      .orderBy(asc(kitPhoto.createdAt), asc(kitPhoto.objectKey));

    const photoRows = photos.map((photo) => ({
      id: photo.id,
      path: `/admin/catalog/kits/${row.id}/photos/${photo.id}`,
    }));
    const hasPhoto = photoRows.length > 0;
    const variant = row.variant ?? undefined;
    const label = variant
      ? `${clubLabel ?? "Kit"} ${row.kitType} ${variant}`
      : `${clubLabel ?? "Kit"} ${row.kitType}`;
    const competition = row.competition ?? undefined;
    const competitions = await this.competitionLinks(competition, variant ? [variant] : []);
    const competitionHref = competitions.find((row) => row.href)?.href;

    let parentKit: { id: string; label: string } | undefined;
    let variants: {
      id: string;
      variant: string;
      label: string;
      competition?: string;
      competitionHref?: string;
      competitions?: { label: string; href?: string }[];
      hasPhoto: boolean;
      photoPath?: string;
    }[] = [];

    if (row.clubId) {
      if (variant) {
        parentKit = await this.findTypeDefaultKit(row.clubId, row.seasonId, row.kitType, clubLabel);
      } else {
        variants = await this.listTypeOccasionKits(
          row.clubId,
          row.seasonId,
          row.kitType,
          clubLabel,
        );
      }
    }

    return adminKitDrillSchema.parse({
      id: row.id,
      label,
      kitType: row.kitType,
      variant,
      clubId: row.clubId ?? undefined,
      clubLabel,
      clubMonogram: clubLabel ? monogramFromLabel(clubLabel) : undefined,
      clubMarkPath,
      seasonLabel: row.seasonLabel,
      brandLabel,
      sponsorName: row.sponsorName ?? undefined,
      design: row.design ?? undefined,
      colorNames: row.colorNames ?? undefined,
      primaryColorHex: row.primaryColorHex ?? undefined,
      secondaryColorHex: row.secondaryColorHex ?? undefined,
      competition,
      competitionHref,
      competitions,
      releasedOn: dateOnly(row.releasedOn),
      description: row.description ?? undefined,
      hasPhoto,
      photoPath: hasPhoto ? `/admin/catalog/kits/${row.id}/photo` : undefined,
      photos: photoRows,
      parentKit,
      variants,
    });
  }

  async getKitPhotoBytes(
    kitId: string,
    photoId?: string,
  ): Promise<{ bytes: Uint8Array; contentType: string }> {
    const photos = await this.db
      .select({
        id: kitPhoto.id,
        objectKey: kitPhoto.objectKey,
      })
      .from(kitPhoto)
      .where(
        photoId
          ? and(eq(kitPhoto.kitId, kitId), eq(kitPhoto.id, photoId))
          : eq(kitPhoto.kitId, kitId),
      )
      .orderBy(asc(kitPhoto.createdAt), asc(kitPhoto.objectKey))
      .limit(1);

    const photo = photos[0];

    if (!photo) {
      throw new NotFoundException("Kit photo not found");
    }

    const bytes = await this.objectStore.getObject(photo.objectKey);
    if (!bytes) {
      throw new NotFoundException("Kit photo bytes not found");
    }

    return { bytes, contentType: sniffImageContentType(bytes) };
  }

  private async entityLabel(
    entityType: "club" | "manufacturer",
    entityId: string,
  ): Promise<string | undefined> {
    const labels = await this.db
      .select({
        text: catalogLabel.text,
        locale: catalogLabel.locale,
      })
      .from(catalogLabel)
      .where(
        and(
          eq(catalogLabel.entityType, entityType),
          eq(catalogLabel.entityId, entityId),
          eq(catalogLabel.kind, "label"),
        ),
      );
    const en = labels.find((label) => label.locale === "en");
    const mul = labels.find((label) => label.locale === "mul");
    return en?.text ?? mul?.text ?? labels[0]?.text;
  }

  async getCatalogMarkBytes(
    entityType: "club" | "league" | "honour",
    entityId: string,
  ): Promise<{ bytes: Uint8Array; contentType: string }> {
    const [row] = await this.db
      .select({ objectKey: catalogMark.objectKey })
      .from(catalogMark)
      .where(and(eq(catalogMark.entityType, entityType), eq(catalogMark.entityId, entityId)))
      .limit(1);

    if (!row) {
      throw new NotFoundException("Catalog mark not found");
    }

    const bytes = await this.objectStore.getObject(row.objectKey);
    if (!bytes) {
      throw new NotFoundException("Catalog mark bytes not found");
    }

    return { bytes, contentType: sniffImageContentType(bytes) };
  }

  async getPlayerPhotoBytes(playerId: string): Promise<{ bytes: Uint8Array; contentType: string }> {
    const [row] = await this.db
      .select({ objectKey: playerPhoto.objectKey })
      .from(playerPhoto)
      .where(eq(playerPhoto.playerId, playerId))
      .limit(1);

    if (!row) {
      throw new NotFoundException("Player photo not found");
    }

    const bytes = await this.objectStore.getObject(row.objectKey);
    if (!bytes) {
      throw new NotFoundException("Player photo bytes not found");
    }

    return { bytes, contentType: sniffImageContentType(bytes) };
  }

  async getClubSeasonDrill(
    clubId: string,
    seasonId: string,
    expandSquad = false,
  ): Promise<AdminClubSeasonDrill> {
    const clubQuery = this.db
      .select({
        clubLabel: resolvedEnLabel,
      })
      .from(club)
      .leftJoin(
        catalogLabel,
        and(eq(catalogLabel.entityType, "club"), eq(catalogLabel.entityId, club.id)),
      )
      .where(eq(club.id, clubId))
      .groupBy(club.id)
      .limit(1);

    const seasonQuery = this.db
      .select({
        seasonLabel: season.label,
      })
      .from(season)
      .where(eq(season.id, seasonId))
      .limit(1);

    const countQuery = this.db
      .select({
        squadCount: sql<number>`count(${playerClubSeason.id})::int`,
      })
      .from(playerClubSeason)
      .where(and(eq(playerClubSeason.clubId, clubId), eq(playerClubSeason.seasonId, seasonId)));

    const [[clubRow], [seasonRow], [countRow], kits, players] = await Promise.all([
      clubQuery,
      seasonQuery,
      countQuery,
      this.listClubSeasonKits(clubId, seasonId),
      expandSquad
        ? this.db
            .select({
              id: player.id,
              label: resolvedEnLabel,
              squadNumber: playerClubSeason.squadNumber,
              position: playerClubSeason.position,
            })
            .from(playerClubSeason)
            .innerJoin(player, eq(playerClubSeason.playerId, player.id))
            .leftJoin(
              catalogLabel,
              and(eq(catalogLabel.entityType, "player"), eq(catalogLabel.entityId, player.id)),
            )
            .where(
              and(eq(playerClubSeason.clubId, clubId), eq(playerClubSeason.seasonId, seasonId)),
            )
            .groupBy(player.id, playerClubSeason.squadNumber, playerClubSeason.position)
            .orderBy(asc(playerClubSeason.squadNumber), asc(player.id))
        : Promise.resolve(null),
    ]);

    if (!clubRow?.clubLabel || !seasonRow) {
      throw new NotFoundException("Club season not found");
    }

    const squad = players
      ? players
          .filter((row): row is typeof row & { label: string } => Boolean(row.label))
          .map((row) => ({
            id: row.id,
            label: row.label,
            squadNumber: row.squadNumber,
            position: row.position,
          }))
          .sort(compareSquadOrder)
      : undefined;

    return adminClubSeasonDrillSchema.parse({
      clubId,
      seasonId,
      clubLabel: clubRow.clubLabel,
      seasonLabel: seasonRow.seasonLabel,
      squadCount: countRow?.squadCount ?? 0,
      squad,
      kits,
    });
  }

  async fetchClubSeasonKits(clubId: string, seasonId: string): Promise<AdminClubSeasonKitsFetch> {
    const [clubRow] = await this.db
      .select({
        clubLabel: resolvedEnLabel,
      })
      .from(club)
      .leftJoin(
        catalogLabel,
        and(eq(catalogLabel.entityType, "club"), eq(catalogLabel.entityId, club.id)),
      )
      .where(eq(club.id, clubId))
      .groupBy(club.id)
      .limit(1);

    const [seasonRow] = await this.db
      .select({
        seasonLabel: season.label,
      })
      .from(season)
      .where(eq(season.id, seasonId))
      .limit(1);

    if (!clubRow?.clubLabel || !seasonRow) {
      throw new NotFoundException("Club season not found");
    }

    const [tm] = await this.db
      .select({ value: externalId.value })
      .from(externalId)
      .where(
        and(
          eq(externalId.entityType, "club"),
          eq(externalId.entityId, clubId),
          eq(externalId.system, "transfermarkt"),
        ),
      )
      .limit(1);

    if (!tm?.value) {
      throw new UnprocessableEntityException("Club has no Transfermarkt id");
    }

    return this.fkListingIngest.ingestClubSeason({
      clubTransfermarktId: tm.value,
      seasonLabel: seasonRow.seasonLabel,
      clubLabel: clubRow.clubLabel,
    });
  }

  async getClubDrill(clubId: string): Promise<AdminClubDrill> {
    const [row] = await this.db
      .select({
        id: club.id,
        countryId: club.countryId,
        kind: club.kind,
        validFrom: club.validFrom,
        validTo: club.validTo,
        successorClubId: club.successorClubId,
        foundedOn: club.foundedOn,
        stadiumName: club.stadiumName,
        stadiumCapacity: club.stadiumCapacity,
        websiteUrl: club.websiteUrl,
        label: resolvedEnLabel,
      })
      .from(club)
      .leftJoin(
        catalogLabel,
        and(eq(catalogLabel.entityType, "club"), eq(catalogLabel.entityId, club.id)),
      )
      .where(eq(club.id, clubId))
      .groupBy(
        club.id,
        club.countryId,
        club.kind,
        club.validFrom,
        club.validTo,
        club.successorClubId,
        club.foundedOn,
        club.stadiumName,
        club.stadiumCapacity,
        club.websiteUrl,
      )
      .limit(1);

    if (!row?.label) {
      throw new NotFoundException("Club not found");
    }

    let countryLabel: string | undefined;
    if (row.countryId) {
      const [countryRow] = await this.db
        .select({
          label: resolvedEnLabel,
        })
        .from(country)
        .leftJoin(
          catalogLabel,
          and(eq(catalogLabel.entityType, "country"), eq(catalogLabel.entityId, country.id)),
        )
        .where(eq(country.id, row.countryId))
        .groupBy(country.id)
        .limit(1);
      countryLabel = countryRow?.label ?? undefined;
    }

    let successorLabel: string | undefined;
    if (row.successorClubId) {
      const [successorRow] = await this.db
        .select({
          label: resolvedEnLabel,
        })
        .from(club)
        .leftJoin(
          catalogLabel,
          and(eq(catalogLabel.entityType, "club"), eq(catalogLabel.entityId, club.id)),
        )
        .where(eq(club.id, row.successorClubId))
        .groupBy(club.id)
        .limit(1);
      successorLabel = successorRow?.label ?? undefined;
    }

    return adminClubDrillSchema.parse({
      id: row.id,
      label: row.label,
      countryLabel,
      monogram: monogramFromLabel(row.label),
      markPath: (await this.catalogMarkPaths("club", [clubId])).get(clubId),
      kind: row.kind,
      validFrom: row.validFrom ?? null,
      validTo: row.validTo ?? null,
      successorLabel,
      currentLeagueLabel: await this.currentLeagueLabel(clubId),
      foundedOn: row.foundedOn ?? null,
      stadiumName: row.stadiumName ?? null,
      stadiumCapacity: row.stadiumCapacity ?? null,
      websiteUrl: row.websiteUrl ?? null,
      seasons: await this.listClubSeasons(clubId),
      honours: await this.listClubHonours(clubId),
    });
  }

  async getSeasonDrill(seasonId: string): Promise<AdminSeasonDrill> {
    const [row] = await this.db
      .select({
        id: season.id,
        label: season.label,
        leagueLabel: resolvedEnLabel,
      })
      .from(season)
      .leftJoin(league, eq(season.leagueId, league.id))
      .leftJoin(
        catalogLabel,
        and(eq(catalogLabel.entityType, "league"), eq(catalogLabel.entityId, league.id)),
      )
      .where(eq(season.id, seasonId))
      .groupBy(season.id, season.label)
      .limit(1);

    if (!row) {
      throw new NotFoundException("Season not found");
    }

    return adminSeasonDrillSchema.parse({
      id: row.id,
      label: row.label,
      leagueLabel: row.leagueLabel ?? undefined,
      monogram: monogramFromLabel(row.label),
    });
  }

  async getLeagueDrill(leagueId: string): Promise<AdminLeagueDrill> {
    const [row] = await this.db
      .select({
        id: league.id,
        label: resolvedEnLabel,
        countryLabel: countryLabelSubquery(league.countryId),
      })
      .from(league)
      .leftJoin(
        catalogLabel,
        and(eq(catalogLabel.entityType, "league"), eq(catalogLabel.entityId, league.id)),
      )
      .where(eq(league.id, leagueId))
      .groupBy(league.id, league.countryId)
      .limit(1);

    if (!row?.label) {
      throw new NotFoundException("League not found");
    }

    const seasons = await this.db
      .select({
        id: season.id,
        label: season.label,
      })
      .from(season)
      .where(eq(season.leagueId, leagueId))
      .orderBy(desc(season.startsOn));

    return adminLeagueDrillSchema.parse({
      id: row.id,
      label: row.label,
      countryLabel: row.countryLabel ?? undefined,
      monogram: monogramFromLabel(row.label),
      markPath: (await this.catalogMarkPaths("league", [leagueId])).get(leagueId),
      seasons,
    });
  }

  async getPlayerDrill(playerId: string): Promise<AdminPlayerDrill> {
    const [row] = await this.db
      .select({
        id: player.id,
        label: resolvedEnLabel,
        dateOfBirth: player.dateOfBirth,
        countryLabel: countryLabelSubquery(player.primaryCountryId),
      })
      .from(player)
      .leftJoin(
        catalogLabel,
        and(eq(catalogLabel.entityType, "player"), eq(catalogLabel.entityId, player.id)),
      )
      .where(eq(player.id, playerId))
      .groupBy(player.id, player.dateOfBirth, player.primaryCountryId)
      .limit(1);

    if (!row?.label) {
      throw new NotFoundException("Player not found");
    }

    const clubSeasons = await this.db
      .select({
        clubLabel: resolvedEnLabel,
        seasonLabel: season.label,
        squadNumber: playerClubSeason.squadNumber,
      })
      .from(playerClubSeason)
      .innerJoin(club, eq(playerClubSeason.clubId, club.id))
      .innerJoin(season, eq(playerClubSeason.seasonId, season.id))
      .leftJoin(
        catalogLabel,
        and(eq(catalogLabel.entityType, "club"), eq(catalogLabel.entityId, club.id)),
      )
      .where(eq(playerClubSeason.playerId, playerId))
      .groupBy(
        playerClubSeason.id,
        club.id,
        season.label,
        season.startsOn,
        playerClubSeason.squadNumber,
      )
      .orderBy(desc(season.startsOn));

    return adminPlayerDrillSchema.parse({
      id: row.id,
      label: row.label,
      monogram: monogramFromLabel(row.label),
      markPath: (await this.playerPhotoPaths([playerId])).get(playerId),
      dateOfBirth: row.dateOfBirth ?? null,
      countryLabel: row.countryLabel ?? undefined,
      clubSeasons: clubSeasons
        .filter((item): item is typeof item & { clubLabel: string } => Boolean(item.clubLabel))
        .map((item) => ({
          clubLabel: item.clubLabel,
          seasonLabel: item.seasonLabel,
          squadNumber: item.squadNumber,
        })),
    });
  }

  private async matchingCatalogIds(searchPattern: string | null): Promise<{
    countries: Set<string>;
    leagues: Set<string>;
    clubs: Set<string>;
    players: Set<string>;
  }> {
    if (!searchPattern) {
      return {
        countries: new Set(),
        leagues: new Set(),
        clubs: new Set(),
        players: new Set(),
      };
    }

    const matches = await this.db
      .select({
        entityType: catalogLabel.entityType,
        entityId: catalogLabel.entityId,
      })
      .from(catalogLabel)
      .where(
        and(
          inArray(catalogLabel.entityType, ["country", "league", "club", "player"]),
          sql`${catalogLabel.text} ilike ${searchPattern}`,
        ),
      );

    const countries = new Set<string>();
    const leagues = new Set<string>();
    const clubs = new Set<string>();
    const players = new Set<string>();
    for (const match of matches) {
      if (match.entityType === "country") {
        countries.add(match.entityId);
      } else if (match.entityType === "league") {
        leagues.add(match.entityId);
      } else if (match.entityType === "club") {
        clubs.add(match.entityId);
      } else if (match.entityType === "player") {
        players.add(match.entityId);
      }
    }

    return { countries, leagues, clubs, players };
  }

  private async listClubPage(
    query: AdminStamdataQuery,
    searchPattern: string | null,
  ): Promise<AdminStamdataList> {
    const conditions: SQL[] = [];

    if (query.countryIds && query.countryIds.length > 0) {
      conditions.push(inArray(club.countryId, query.countryIds));
    }
    if (query.leagueIds && query.leagueIds.length > 0) {
      conditions.push(
        sql`exists (
          select 1 from ${teamSeason}
          inner join ${season} on ${teamSeason.seasonId} = ${season.id}
          where ${teamSeason.clubId} = ${club.id}
          and ${inArray(season.leagueId, query.leagueIds)}
        )`,
      );
    }
    if (query.seasonId) {
      conditions.push(
        sql`exists (
          select 1 from ${teamSeason}
          where ${teamSeason.clubId} = ${club.id}
          and ${teamSeason.seasonId} = ${query.seasonId}
        )`,
      );
    }

    const catalogIds = await this.matchingCatalogIds(searchPattern);
    if (searchPattern) {
      const searchClauses: SQL[] = [];
      if (catalogIds.clubs.size > 0) {
        searchClauses.push(inArray(club.id, [...catalogIds.clubs]));
      }
      if (catalogIds.countries.size > 0) {
        searchClauses.push(inArray(club.countryId, [...catalogIds.countries]));
      }
      if (catalogIds.leagues.size > 0) {
        searchClauses.push(
          sql`exists (
            select 1 from ${teamSeason}
            inner join ${season} on ${teamSeason.seasonId} = ${season.id}
            where ${teamSeason.clubId} = ${club.id}
            and ${season.leagueId} in (${sql.join(
              [...catalogIds.leagues].map((id) => sql`${id}`),
              sql`, `,
            )})
          )`,
        );
      }
      if (searchClauses.length === 0) {
        return adminStamdataListSchema.parse({ total: 0, rows: [] });
      }
      const searchClause = or(...searchClauses);
      if (searchClause) {
        conditions.push(searchClause);
      }
    }

    const rows = await this.db
      .select({
        id: club.id,
        label: resolvedEnLabel,
        countryLabel: countryLabelSubquery(club.countryId),
      })
      .from(club)
      .leftJoin(
        catalogLabel,
        and(eq(catalogLabel.entityType, "club"), eq(catalogLabel.entityId, club.id)),
      )
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(club.id, club.countryId)
      .orderBy(asc(resolvedEnLabel));

    const mapped: AdminStamdataRow[] = rows
      .filter((row): row is typeof row & { label: string } => Boolean(row.label))
      .map((row) => ({
        entityType: "club" as const,
        id: row.id,
        label: row.label,
        monogram: monogramFromLabel(row.label),
        countryLabel: row.countryLabel ?? undefined,
      }));

    const offset = pageOffset(query);
    const limit = pageLimit(query);
    const page = mapped.slice(offset, offset + limit);
    const markPaths = await this.catalogMarkPaths(
      "club",
      page.map((row) => row.id),
    );
    return adminStamdataListSchema.parse({
      total: mapped.length,
      rows: page.map((row) => ({
        ...row,
        markPath: markPaths.get(row.id),
      })),
    });
  }

  private async listLeaguePage(
    query: AdminStamdataQuery,
    searchPattern: string | null,
  ): Promise<AdminStamdataList> {
    const conditions: SQL[] = [];

    if (query.countryIds && query.countryIds.length > 0) {
      conditions.push(inArray(league.countryId, query.countryIds));
    }

    const catalogIds = await this.matchingCatalogIds(searchPattern);
    if (searchPattern) {
      const searchClauses: SQL[] = [];
      if (catalogIds.leagues.size > 0) {
        searchClauses.push(inArray(league.id, [...catalogIds.leagues]));
      }
      if (catalogIds.countries.size > 0) {
        searchClauses.push(inArray(league.countryId, [...catalogIds.countries]));
      }
      if (searchClauses.length === 0) {
        return adminStamdataListSchema.parse({ total: 0, rows: [] });
      }
      const searchClause = or(...searchClauses);
      if (searchClause) {
        conditions.push(searchClause);
      }
    }

    const rows = await this.db
      .select({
        id: league.id,
        label: resolvedEnLabel,
        countryLabel: countryLabelSubquery(league.countryId),
      })
      .from(league)
      .leftJoin(
        catalogLabel,
        and(eq(catalogLabel.entityType, "league"), eq(catalogLabel.entityId, league.id)),
      )
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(league.id, league.countryId)
      .orderBy(asc(resolvedEnLabel));

    const mapped: AdminStamdataRow[] = rows
      .filter((row): row is typeof row & { label: string } => Boolean(row.label))
      .map((row) => ({
        entityType: "league" as const,
        id: row.id,
        label: row.label,
        monogram: monogramFromLabel(row.label),
        countryLabel: row.countryLabel ?? undefined,
      }));

    const offset = pageOffset(query);
    const limit = pageLimit(query);
    const page = mapped.slice(offset, offset + limit);
    const markPaths = await this.catalogMarkPaths(
      "league",
      page.map((row) => row.id),
    );
    return adminStamdataListSchema.parse({
      total: mapped.length,
      rows: page.map((row) => ({
        ...row,
        markPath: markPaths.get(row.id),
      })),
    });
  }

  private async listPlayerPage(
    query: AdminStamdataQuery,
    searchPattern: string | null,
  ): Promise<AdminStamdataList> {
    const conditions: SQL[] = [];

    if (query.countryIds && query.countryIds.length > 0) {
      conditions.push(inArray(player.primaryCountryId, query.countryIds));
    }
    if (query.leagueIds && query.leagueIds.length > 0) {
      conditions.push(
        sql`exists (
          select 1 from ${playerClubSeason}
          inner join ${season} on ${playerClubSeason.seasonId} = ${season.id}
          where ${playerClubSeason.playerId} = ${player.id}
          and ${inArray(season.leagueId, query.leagueIds)}
        )`,
      );
    }

    const catalogIds = await this.matchingCatalogIds(searchPattern);
    if (searchPattern) {
      const searchClauses: SQL[] = [];
      if (catalogIds.players.size > 0) {
        searchClauses.push(inArray(player.id, [...catalogIds.players]));
      }
      if (catalogIds.countries.size > 0) {
        searchClauses.push(inArray(player.primaryCountryId, [...catalogIds.countries]));
      }
      if (catalogIds.clubs.size > 0) {
        searchClauses.push(
          sql`exists (
            select 1 from ${playerClubSeason}
            where ${playerClubSeason.playerId} = ${player.id}
            and ${playerClubSeason.clubId} in (${sql.join(
              [...catalogIds.clubs].map((id) => sql`${id}`),
              sql`, `,
            )})
          )`,
        );
      }
      if (searchClauses.length === 0) {
        return adminStamdataListSchema.parse({ total: 0, rows: [] });
      }
      const searchClause = or(...searchClauses);
      if (searchClause) {
        conditions.push(searchClause);
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const countRows = await this.db
      .select({
        total: sql<number>`cast(count(distinct ${player.id}) as int)`,
      })
      .from(player)
      .leftJoin(
        catalogLabel,
        and(eq(catalogLabel.entityType, "player"), eq(catalogLabel.entityId, player.id)),
      )
      .where(whereClause);
    const total = countRows[0]?.total ?? 0;

    const rows = await this.db
      .select({
        id: player.id,
        label: resolvedEnLabel,
        dateOfBirth: player.dateOfBirth,
        countryLabel: countryLabelSubquery(player.primaryCountryId),
      })
      .from(player)
      .leftJoin(
        catalogLabel,
        and(eq(catalogLabel.entityType, "player"), eq(catalogLabel.entityId, player.id)),
      )
      .where(whereClause)
      .groupBy(player.id, player.dateOfBirth, player.primaryCountryId)
      .orderBy(asc(resolvedEnLabel))
      .limit(pageLimit(query))
      .offset(pageOffset(query));

    const photoPaths = await this.playerPhotoPaths(rows.map((row) => row.id));
    return adminStamdataListSchema.parse({
      total,
      rows: rows
        .filter((row): row is typeof row & { label: string } => Boolean(row.label))
        .map((row) => ({
          entityType: "player" as const,
          id: row.id,
          label: row.label,
          monogram: monogramFromLabel(row.label),
          markPath: photoPaths.get(row.id),
          countryLabel: row.countryLabel ?? undefined,
          dateOfBirth: row.dateOfBirth ?? null,
        })),
    });
  }

  private async catalogMarkPaths(
    entityType: "club" | "league" | "honour",
    ids: string[],
  ): Promise<Map<string, string>> {
    const paths = new Map<string, string>();
    if (ids.length === 0) {
      return paths;
    }
    const rows = await this.db
      .select({ entityId: catalogMark.entityId })
      .from(catalogMark)
      .where(and(eq(catalogMark.entityType, entityType), inArray(catalogMark.entityId, ids)));
    const toPath =
      entityType === "club"
        ? clubMarkPath
        : entityType === "league"
          ? leagueMarkPath
          : honourMarkPath;
    for (const row of rows) {
      paths.set(row.entityId, toPath(row.entityId));
    }
    return paths;
  }

  private async playerPhotoPaths(ids: string[]): Promise<Map<string, string>> {
    const paths = new Map<string, string>();
    if (ids.length === 0) {
      return paths;
    }
    const rows = await this.db
      .select({ playerId: playerPhoto.playerId })
      .from(playerPhoto)
      .where(inArray(playerPhoto.playerId, ids));
    for (const row of rows) {
      paths.set(row.playerId, playerPhotoPath(row.playerId));
    }
    return paths;
  }

  private async listClubHonours(clubId: string) {
    const rows = await this.db
      .select({
        id: honour.id,
        seasonLabel: honour.seasonLabel,
        title: honour.title,
      })
      .from(honour)
      .where(and(eq(honour.subjectType, "club"), eq(honour.subjectId, clubId)))
      .orderBy(desc(honour.seasonLabel), asc(honour.title));
    const markPaths = await this.catalogMarkPaths(
      "honour",
      rows.map((row) => row.id),
    );
    return rows.map((row) => ({
      id: row.id,
      seasonLabel: row.seasonLabel,
      title: row.title,
      markPath: markPaths.get(row.id),
    }));
  }

  private async currentLeagueLabel(clubId: string): Promise<string | undefined> {
    const seasons = await this.listClubSeasons(clubId);
    const latest = seasons[0];
    if (!latest) {
      return undefined;
    }
    const [row] = await this.db
      .select({
        label: resolvedEnLabel,
      })
      .from(season)
      .leftJoin(league, eq(season.leagueId, league.id))
      .leftJoin(
        catalogLabel,
        and(eq(catalogLabel.entityType, "league"), eq(catalogLabel.entityId, league.id)),
      )
      .where(eq(season.id, latest.id))
      .groupBy(league.id)
      .limit(1);
    return row?.label ?? undefined;
  }

  private async listClubSeasons(clubId: string): Promise<Array<{ id: string; label: string }>> {
    const fromTeam = await this.db
      .select({
        id: season.id,
        label: season.label,
        startsOn: season.startsOn,
      })
      .from(teamSeason)
      .innerJoin(season, eq(teamSeason.seasonId, season.id))
      .where(eq(teamSeason.clubId, clubId));

    const fromKits = await this.db
      .select({
        id: season.id,
        label: season.label,
        startsOn: season.startsOn,
      })
      .from(kit)
      .innerJoin(season, eq(kit.seasonId, season.id))
      .where(eq(kit.clubId, clubId));

    const fromSquad = await this.db
      .select({
        id: season.id,
        label: season.label,
        startsOn: season.startsOn,
      })
      .from(playerClubSeason)
      .innerJoin(season, eq(playerClubSeason.seasonId, season.id))
      .where(eq(playerClubSeason.clubId, clubId));

    const byId = new Map<string, { id: string; label: string; startsOn: string }>();
    for (const row of [...fromTeam, ...fromKits, ...fromSquad]) {
      byId.set(row.id, row);
    }
    return [...byId.values()]
      .sort((left, right) => right.startsOn.localeCompare(left.startsOn))
      .map(({ id, label }) => ({ id, label }));
  }

  private async listClubSeasonKits(clubId: string, seasonId: string) {
    const photoCountSql = sql<number>`count(${kitPhoto.id})::int`;
    const rows = await this.db
      .select({
        id: kit.id,
        kitType: kit.type,
        variant: kit.variant,
        clubLabel: resolvedEnLabel,
        photoCount: photoCountSql,
      })
      .from(kit)
      .leftJoin(club, eq(kit.clubId, club.id))
      .leftJoin(
        catalogLabel,
        and(eq(catalogLabel.entityType, "club"), eq(catalogLabel.entityId, club.id)),
      )
      .leftJoin(kitPhoto, eq(kitPhoto.kitId, kit.id))
      .where(and(eq(kit.clubId, clubId), eq(kit.seasonId, seasonId)))
      .groupBy(kit.id, kit.type, kit.variant)
      .orderBy(asc(kit.type), asc(kit.variant));

    return rows
      .filter((row) => !isOccasionNestedUnderTypeDefault(row, rows))
      .map((row) => {
        const hasPhoto = row.photoCount > 0;
        const clubName = row.clubLabel ?? "Kit";
        const variant = row.variant ?? undefined;
        const variantCount = variant
          ? 0
          : rows.filter((other) => other.kitType === row.kitType && other.variant).length;
        return {
          id: row.id,
          label: variant ? `${clubName} ${row.kitType} ${variant}` : `${clubName} ${row.kitType}`,
          kitType: row.kitType,
          variant,
          variantCount,
          hasPhoto,
          photoPath: hasPhoto ? `/admin/catalog/kits/${row.id}/photo` : undefined,
        };
      });
  }

  private async findTypeDefaultKit(
    clubId: string,
    seasonId: string,
    kitType: (typeof KIT_TYPES)[number],
    clubLabel: string | undefined,
  ): Promise<{ id: string; label: string } | undefined> {
    const [row] = await this.db
      .select({ id: kit.id })
      .from(kit)
      .where(
        and(
          eq(kit.clubId, clubId),
          eq(kit.seasonId, seasonId),
          eq(kit.type, kitType),
          isNull(kit.variant),
        ),
      )
      .limit(1);
    if (!row) {
      return undefined;
    }
    return {
      id: row.id,
      label: `${clubLabel ?? "Kit"} ${kitType}`,
    };
  }

  private async listTypeOccasionKits(
    clubId: string,
    seasonId: string,
    kitType: (typeof KIT_TYPES)[number],
    clubLabel: string | undefined,
  ) {
    const photoCountSql = sql<number>`count(${kitPhoto.id})::int`;
    const rows = await this.db
      .select({
        id: kit.id,
        variant: kit.variant,
        competition: kit.competition,
        photoCount: photoCountSql,
      })
      .from(kit)
      .leftJoin(kitPhoto, eq(kitPhoto.kitId, kit.id))
      .where(
        and(
          eq(kit.clubId, clubId),
          eq(kit.seasonId, seasonId),
          eq(kit.type, kitType),
          isNotNull(kit.variant),
        ),
      )
      .groupBy(kit.id, kit.variant, kit.competition)
      .orderBy(asc(kit.variant));

    const leagues = await this.leagueLabelRows();
    const listed = [];
    for (const row of rows) {
      const variant = row.variant;
      if (!variant) {
        continue;
      }
      const hasPhoto = row.photoCount > 0;
      const competition = row.competition ?? undefined;
      const competitions = matchCompetitionLinks(competition, [variant], leagues);
      listed.push({
        id: row.id,
        variant,
        label: `${clubLabel ?? "Kit"} ${kitType} ${variant}`,
        competition,
        competitionHref: competitions.find((link) => link.href)?.href,
        competitions,
        hasPhoto,
        photoPath: hasPhoto ? `/admin/catalog/kits/${row.id}/photo` : undefined,
      });
    }
    return listed;
  }

  private async competitionLinks(raw?: string, extraLookup: string[] = []) {
    return matchCompetitionLinks(raw, extraLookup, await this.leagueLabelRows());
  }

  private async leagueLabelRows() {
    return this.db
      .select({ id: league.id, text: catalogLabel.text })
      .from(league)
      .innerJoin(
        catalogLabel,
        and(eq(catalogLabel.entityType, "league"), eq(catalogLabel.entityId, league.id)),
      )
      .where(eq(catalogLabel.kind, "label"));
  }
}
