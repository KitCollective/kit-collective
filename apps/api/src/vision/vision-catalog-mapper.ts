import type { Db } from "@kit/db";
import {
  catalogLabel,
  club,
  kit,
  manufacturer,
  nationalTeam,
  nationalTeamSeason,
  patch,
  playerClubSeason,
  playerNationalTeamSeason,
  season,
  teamSeason,
} from "@kit/db";
import { and, eq, inArray, or, type SQL, type SQLWrapper, sql } from "drizzle-orm";
import type { IdentityVisionHints } from "./identity-vision-prompt.js";
import type { VisionFieldConfidences, VisionInferenceResult } from "./vision.adapter.js";
import {
  combineModelAndMatchConfidence,
  computeOverallConfidence,
  encodeVisionEvalRaw,
} from "./vision-confidence.js";
import {
  CATALOG_KIT_LOCK_CONFIDENCE,
  type CatalogSideKind,
  type CatalogSideMatch,
  catalogClubIdForSave,
  catalogHintSearchNeedles,
  catalogNationalTeamIdForSave,
  collectClubHints,
  compactCatalogHint,
  type ObservableKitHit,
  pickBestCatalogSide,
  pickLockedKit,
  scoreLabelMatch,
} from "./vision-kit-lock.js";

export type VisionCatalogHints = IdentityVisionHints;

export type VisionMapOptions = {
  amongKitIds?: string[];
};

type PatchMatch = {
  patchId: string;
  score: number;
};

type PlayerMatch = {
  playerId: string;
  playerNumber?: string;
  score: number;
};

type SquadRow = {
  playerId: string;
  squadNumber: number | null;
};

const KIT_HIT_LIMIT = 40;
const SIDE_LABEL_LIMIT = 40;
const PLAYER_LABEL_LIMIT = 20;
const PATCH_LABEL_LIMIT = 10;
const SQUAD_NUMBER_MATCH_SCORE = 90;

/**
 * Intentional omit cases (QA scoring):
 * - Blank shirt back → VLM omits playerHint/playerNumberHint → no player suggestion.
 * - seasonHint with no teamSeason/nationalTeamSeason row for the scoped side → no seasonId.
 * - Model per-field confidence below suggest threshold → resolveIdentityJob omits that field.
 * - Missing manufacturerHint → no observable kit hits → no catalogKitId lock.
 * - Ambiguous manufacturer+sponsor hits → omit catalogKitId until refinement or type/colour lock.
 * - Empty badges[] → decodeIdentityVisionHints drops patchHint.
 */
export class VisionCatalogMapper {
  constructor(private readonly db: Db) {}

  async mapHints(
    hints: VisionCatalogHints,
    options: VisionMapOptions = {},
  ): Promise<VisionInferenceResult | null> {
    const sideMatch = await this.resolveSide(hints);
    const hits = await this.listObservableKitHits(hints, sideMatch);
    const locked = pickLockedKit(hits, {
      amongKitIds: options.amongKitIds,
      sideId: sideMatch?.id,
      seasonHint: hints.seasonHint,
      kitType: hints.kitType,
      colorHint: hints.colorHint,
    });

    const clubId = catalogClubIdForSave(locked, sideMatch);
    const nationalTeamId = catalogNationalTeamIdForSave(locked, sideMatch);
    const playerScope = playerScopeFor(locked, clubId, nationalTeamId, sideMatch);
    const hintSeason =
      locked?.seasonId === undefined
        ? await this.resolveSeasonFromHint(playerScope, hints.seasonHint)
        : null;
    const seasonId = locked?.seasonId ?? hintSeason?.seasonId;
    const type = locked?.type ?? hints.kitType;
    const playerMatch =
      playerScope && seasonId
        ? await this.resolvePlayer(
            playerScope.kind,
            playerScope.id,
            seasonId,
            hints.playerNumberHint,
            hints.playerHint,
          )
        : null;
    const patchMatch = seasonId ? await this.resolvePatch(seasonId, hints.patchHint) : null;

    if (!clubId && !nationalTeamId && !locked && !playerMatch && !patchMatch) {
      if (hints.clubHint || hints.clubHintAlts?.length) {
        return {
          clubHint: collectClubHints(hints)[0],
          kitHitCount: hits.length,
          visionRaw: encodeVisionEvalRaw(hints, hits.length),
          confidences: this.buildConfidences(hints, {}),
        };
      }
      return null;
    }

    return {
      clubId,
      nationalTeamId,
      seasonId,
      catalogKitId: locked?.kitId,
      type,
      playerId: playerMatch?.playerId,
      playerNumber: playerMatch?.playerNumber,
      patchId: patchMatch?.patchId,
      clubHint: hints.clubHint,
      kitHitCount: hits.length,
      visionRaw: encodeVisionEvalRaw(hints, hits.length),
      confidences: this.buildConfidences(hints, {
        club: clubId ? clubMatchScore(sideMatch, locked) : undefined,
        nationalTeam: nationalTeamId ? clubMatchScore(sideMatch, locked) : undefined,
        season: locked ? CATALOG_KIT_LOCK_CONFIDENCE : hintSeason?.score,
        kitType: locked ? CATALOG_KIT_LOCK_CONFIDENCE : undefined,
        player: playerMatch?.score,
        badge: patchMatch?.score,
        kitLocked: Boolean(locked),
      }),
    };
  }

  async listObservableKitHits(
    hints: VisionCatalogHints,
    sideMatch?: CatalogSideMatch | null,
  ): Promise<ObservableKitHit[]> {
    const manufacturerHint = hints.manufacturerHint?.trim();
    const sponsorHint = hints.sponsorHint?.trim();
    if (!manufacturerHint) {
      return [];
    }
    const side = sideMatch === undefined ? await this.resolveSide(hints) : sideMatch;
    if (!sponsorHint && !side) {
      return [];
    }

    const manufacturerClause = hintMatchSql(catalogLabel.text, [manufacturerHint]);
    if (!manufacturerClause) {
      return [];
    }

    const rows = await this.db
      .select({
        kitId: kit.id,
        clubId: kit.clubId,
        nationalTeamId: kit.nationalTeamId,
        seasonId: kit.seasonId,
        type: kit.type,
        sponsorName: kit.sponsorName,
        manufacturerText: catalogLabel.text,
        seasonLabel: season.label,
        colorNames: kit.colorNames,
      })
      .from(kit)
      .innerJoin(manufacturer, eq(kit.manufacturerId, manufacturer.id))
      .innerJoin(catalogLabel, eq(catalogLabel.entityId, manufacturer.id))
      .innerJoin(season, eq(kit.seasonId, season.id))
      .where(
        and(
          eq(catalogLabel.entityType, "manufacturer"),
          manufacturerClause,
          sponsorHint ? hintMatchSql(kit.sponsorName, [sponsorHint]) : kitSideEquals(side),
        ),
      )
      .limit(KIT_HIT_LIMIT);

    return rows.flatMap((row) => {
      if (scoreLabelMatch(row.manufacturerText ?? "", manufacturerHint) <= 0) {
        return [];
      }
      if (sponsorHint && scoreLabelMatch(row.sponsorName ?? "", sponsorHint) <= 0) {
        return [];
      }
      return [
        {
          kitId: row.kitId,
          clubId: row.clubId,
          nationalTeamId: row.nationalTeamId,
          seasonId: row.seasonId,
          seasonLabel: row.seasonLabel,
          type: row.type,
          manufacturer: row.manufacturerText,
          sponsor: row.sponsorName ?? sponsorHint ?? "",
          colorNames: row.colorNames,
        },
      ];
    });
  }

  private async resolveSide(hints: VisionCatalogHints): Promise<CatalogSideMatch | null> {
    const hintTexts = collectClubHints(hints);
    const sideClause =
      hintTexts.length > 0 ? hintMatchSql(catalogLabel.text, hintTexts) : undefined;
    if (!sideClause) {
      return null;
    }

    const labelRows = await this.db
      .selectDistinct({
        entityType: catalogLabel.entityType,
        entityId: catalogLabel.entityId,
        text: catalogLabel.text,
        kind: catalogLabel.kind,
      })
      .from(catalogLabel)
      .where(and(inArray(catalogLabel.entityType, ["club", "national_team"]), sideClause))
      .limit(SIDE_LABEL_LIMIT);

    if (labelRows.length === 0) {
      return null;
    }

    const clubIds = idsForEntityType(labelRows, "club");
    const nationalTeamIds = idsForEntityType(labelRows, "national_team");
    const [existingClubs, existingNationalTeams] = await Promise.all([
      this.existingIds(club, clubIds),
      this.existingIds(nationalTeam, nationalTeamIds),
    ]);

    return pickBestCatalogSide(
      labelRows,
      hintTexts,
      new Set(existingClubs),
      new Set(existingNationalTeams),
    );
  }

  private async existingIds(
    table: typeof club | typeof nationalTeam,
    ids: string[],
  ): Promise<string[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.db.select({ id: table.id }).from(table).where(inArray(table.id, ids));
    return rows.map((row) => row.id);
  }

  private async resolveSeasonFromHint(
    playerScope: { kind: CatalogSideKind; id: string } | undefined,
    seasonHint?: string,
  ): Promise<{ seasonId: string; score: number } | null> {
    if (!playerScope || !seasonHint?.trim()) {
      return null;
    }

    if (playerScope.kind === "club") {
      const rows = await this.db
        .select({ seasonId: teamSeason.seasonId, label: season.label })
        .from(teamSeason)
        .innerJoin(season, eq(teamSeason.seasonId, season.id))
        .where(eq(teamSeason.clubId, playerScope.id));

      return (
        bestScored(
          rows.map((row) => ({
            seasonId: row.seasonId,
            score: scoreLabelMatch(row.label, seasonHint),
          })),
        ) ?? null
      ) as { seasonId: string; score: number } | null;
    }

    const rows = await this.db
      .select({ seasonId: nationalTeamSeason.seasonId, label: season.label })
      .from(nationalTeamSeason)
      .innerJoin(season, eq(nationalTeamSeason.seasonId, season.id))
      .where(eq(nationalTeamSeason.nationalTeamId, playerScope.id));

    return (
      bestScored(
        rows.map((row) => ({
          seasonId: row.seasonId,
          score: scoreLabelMatch(row.label, seasonHint),
        })),
      ) ?? null
    ) as { seasonId: string; score: number } | null;
  }

  private async resolvePlayer(
    sideKind: CatalogSideKind,
    sideId: string,
    seasonId: string,
    numberHint?: string,
    nameHint?: string,
  ): Promise<PlayerMatch | null> {
    const parsedNumber = parseSquadNumber(numberHint);
    if (parsedNumber !== undefined) {
      const row = await this.findSquadByNumber(sideKind, sideId, seasonId, parsedNumber);
      if (row) {
        return {
          playerId: row.playerId,
          playerNumber: String(row.squadNumber ?? parsedNumber),
          score: SQUAD_NUMBER_MATCH_SCORE,
        };
      }
    }

    if (!nameHint?.trim()) {
      return null;
    }

    const nameClause = hintMatchSql(catalogLabel.text, [nameHint]);
    if (!nameClause) {
      return null;
    }

    const labelRows = await this.db
      .selectDistinct({
        entityId: catalogLabel.entityId,
        text: catalogLabel.text,
      })
      .from(catalogLabel)
      .where(and(eq(catalogLabel.entityType, "player"), nameClause))
      .limit(PLAYER_LABEL_LIMIT);

    if (labelRows.length === 0) {
      return null;
    }

    const scopedRows = await this.listSquadByPlayerIds(
      sideKind,
      sideId,
      seasonId,
      labelRows.map((row) => row.entityId),
    );

    return (
      bestScored(
        scopedRows.map((row) => ({
          playerId: row.playerId,
          playerNumber: row.squadNumber ? String(row.squadNumber) : undefined,
          score: scoreLabelMatch(
            labelRows.find((entry) => entry.entityId === row.playerId)?.text ?? "",
            nameHint,
          ),
        })),
      ) ?? null
    );
  }

  private async findSquadByNumber(
    sideKind: CatalogSideKind,
    sideId: string,
    seasonId: string,
    squadNumber: number,
  ): Promise<SquadRow | undefined> {
    if (sideKind === "club") {
      const [row] = await this.db
        .select({
          playerId: playerClubSeason.playerId,
          squadNumber: playerClubSeason.squadNumber,
        })
        .from(playerClubSeason)
        .where(
          and(
            eq(playerClubSeason.clubId, sideId),
            eq(playerClubSeason.seasonId, seasonId),
            eq(playerClubSeason.squadNumber, squadNumber),
          ),
        )
        .limit(1);
      return row;
    }

    const [row] = await this.db
      .select({
        playerId: playerNationalTeamSeason.playerId,
        squadNumber: playerNationalTeamSeason.squadNumber,
      })
      .from(playerNationalTeamSeason)
      .where(
        and(
          eq(playerNationalTeamSeason.nationalTeamId, sideId),
          eq(playerNationalTeamSeason.seasonId, seasonId),
          eq(playerNationalTeamSeason.squadNumber, squadNumber),
        ),
      )
      .limit(1);
    return row;
  }

  private async listSquadByPlayerIds(
    sideKind: CatalogSideKind,
    sideId: string,
    seasonId: string,
    playerIds: string[],
  ): Promise<SquadRow[]> {
    if (sideKind === "club") {
      return this.db
        .select({
          playerId: playerClubSeason.playerId,
          squadNumber: playerClubSeason.squadNumber,
        })
        .from(playerClubSeason)
        .where(
          and(
            eq(playerClubSeason.clubId, sideId),
            eq(playerClubSeason.seasonId, seasonId),
            inArray(playerClubSeason.playerId, playerIds),
          ),
        );
    }

    return this.db
      .select({
        playerId: playerNationalTeamSeason.playerId,
        squadNumber: playerNationalTeamSeason.squadNumber,
      })
      .from(playerNationalTeamSeason)
      .where(
        and(
          eq(playerNationalTeamSeason.nationalTeamId, sideId),
          eq(playerNationalTeamSeason.seasonId, seasonId),
          inArray(playerNationalTeamSeason.playerId, playerIds),
        ),
      );
  }

  private async resolvePatch(seasonId: string, hint?: string): Promise<PatchMatch | null> {
    if (!hint?.trim()) {
      return null;
    }

    const patchClause = hintMatchSql(catalogLabel.text, [hint]);
    if (!patchClause) {
      return null;
    }

    const labelRows = await this.db
      .selectDistinct({
        entityId: catalogLabel.entityId,
        text: catalogLabel.text,
      })
      .from(catalogLabel)
      .innerJoin(patch, eq(patch.id, catalogLabel.entityId))
      .where(and(eq(catalogLabel.entityType, "patch"), eq(patch.seasonId, seasonId), patchClause))
      .limit(PATCH_LABEL_LIMIT);

    return (
      bestScored(
        labelRows.map((row) => ({
          patchId: row.entityId,
          score: scoreLabelMatch(row.text ?? "", hint),
        })),
      ) ?? null
    );
  }

  private buildConfidences(
    hints: IdentityVisionHints,
    match: {
      club?: number;
      nationalTeam?: number;
      season?: number;
      kitType?: number;
      player?: number;
      badge?: number;
      kitLocked?: boolean;
    },
  ): VisionFieldConfidences {
    const fields = hints.fieldConfidence;
    const club = combineModelAndMatchConfidence(fields?.club, match.club);
    const nationalTeam = combineModelAndMatchConfidence(fields?.club, match.nationalTeam);
    const season = match.kitLocked
      ? CATALOG_KIT_LOCK_CONFIDENCE
      : combineModelAndMatchConfidence(fields?.season, match.season);
    const kitType = match.kitLocked
      ? CATALOG_KIT_LOCK_CONFIDENCE
      : combineModelAndMatchConfidence(fields?.kitType, match.kitType);
    const player = combineModelAndMatchConfidence(fields?.player, match.player);
    const badge = combineModelAndMatchConfidence(fields?.badge, match.badge);
    const fieldScores = [club, nationalTeam, season, kitType, player, badge].filter(
      (score): score is number => typeof score === "number",
    );
    const overallFromFields =
      fieldScores.length > 0
        ? Math.round(fieldScores.reduce((sum, score) => sum + score, 0) / fieldScores.length)
        : 0;
    const modelOverall = computeOverallConfidence(hints.confidence);

    return {
      overall: modelOverall > 0 ? modelOverall : overallFromFields,
      club,
      nationalTeam,
      season,
      kitType,
      player,
      badge,
    };
  }
}

function kitSideEquals(side: CatalogSideMatch | null): SQL | undefined {
  if (!side) {
    return undefined;
  }
  return side.kind === "club" ? eq(kit.clubId, side.id) : eq(kit.nationalTeamId, side.id);
}

function playerScopeFor(
  locked: ObservableKitHit | null,
  clubId: string | undefined,
  nationalTeamId: string | undefined,
  sideMatch: CatalogSideMatch | null,
): { kind: CatalogSideKind; id: string } | undefined {
  if (locked?.nationalTeamId) {
    return { kind: "national_team", id: locked.nationalTeamId };
  }
  if (locked?.clubId) {
    return { kind: "club", id: locked.clubId };
  }
  if (clubId) {
    return { kind: "club", id: clubId };
  }
  if (nationalTeamId) {
    return { kind: "national_team", id: nationalTeamId };
  }
  if (sideMatch) {
    return { kind: sideMatch.kind, id: sideMatch.id };
  }
  return undefined;
}

function clubMatchScore(
  sideMatch: CatalogSideMatch | null,
  locked: ObservableKitHit | null,
): number | undefined {
  if (sideMatch) {
    return sideMatch.score;
  }
  if (locked?.clubId || locked?.nationalTeamId) {
    return CATALOG_KIT_LOCK_CONFIDENCE;
  }
  return undefined;
}

function idsForEntityType(
  rows: Array<{ entityType: string; entityId: string }>,
  entityType: string,
): string[] {
  return rows.filter((row) => row.entityType === entityType).map((row) => row.entityId);
}

function parseSquadNumber(numberHint?: string): number | undefined {
  if (!numberHint?.trim()) {
    return undefined;
  }
  const parsed = Number.parseInt(numberHint.trim(), 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function bestScored<T extends { score: number }>(items: T[]): T | undefined {
  return items.filter((row) => row.score > 0).sort((left, right) => right.score - left.score)[0];
}

function hintMatchSql(column: SQLWrapper, hints: string[]): SQL | undefined {
  const needles = [...new Set(hints.flatMap((hint) => catalogHintSearchNeedles(hint)))];
  if (needles.length === 0) {
    return undefined;
  }
  const clauses: SQL[] = needles.map((needle) => sql`${column} ilike ${`%${needle}%`}`);
  const compacts = [
    ...new Set(hints.map((hint) => compactCatalogHint(hint)).filter((value) => value.length >= 3)),
  ];
  for (const compact of compacts) {
    clauses.push(sql`${compactCatalogColumnSql(column)} = ${compact}`);
    clauses.push(sql`${compactCatalogColumnSql(column)} like ${`%${compact}%`}`);
  }
  return or(...clauses);
}

/** Same compact as `compactCatalogHint`: NFD + ø→o / æ→ae, then strip non-alphanumerics. */
function compactCatalogColumnSql(column: SQLWrapper): SQL {
  const combiningMarks = "[\u0300-\u036f]";
  const folded = sql`replace(replace(replace(replace(replace(replace(replace(
    regexp_replace(normalize(lower(coalesce(${column}, '')), NFD), ${combiningMarks}, '', 'g'),
    'æ', 'ae'), 'ø', 'o'), 'å', 'a'), 'ä', 'a'), 'ö', 'o'), 'ü', 'u'), 'ß', 'ss')`;
  return sql`regexp_replace(${folded}, '[^a-z0-9]', '', 'g')`;
}
