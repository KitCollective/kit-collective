import type { Db } from "@kit/db";
import { catalogLabel, club, kit, patch, playerClubSeason, season, teamSeason } from "@kit/db";
import type { KitType } from "@kit/domain";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { VisionFieldConfidences, VisionInferenceResult } from "./vision.adapter.js";
import { computeOverallConfidence } from "./vision-confidence.js";

export type VisionCatalogHints = {
  clubHint?: string;
  seasonHint?: string;
  kitType?: KitType;
  playerNumberHint?: string;
  playerHint?: string;
  patchHint?: string;
  confidence?: number;
};

type ClubMatch = {
  clubId: string;
  score: number;
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

type SeasonMatch = {
  seasonId: string;
  score: number;
};

function normalizeHint(value: string): string {
  return value.trim().toLowerCase();
}

function scoreLabelMatch(label: string, hint: string): number {
  const normalizedLabel = normalizeHint(label);
  const normalizedHint = normalizeHint(hint);

  if (normalizedLabel === normalizedHint) {
    return 95;
  }
  if (normalizedLabel.startsWith(normalizedHint) || normalizedHint.startsWith(normalizedLabel)) {
    return 85;
  }
  if (normalizedLabel.includes(normalizedHint) || normalizedHint.includes(normalizedLabel)) {
    return 70;
  }

  return 0;
}

export class VisionCatalogMapper {
  constructor(private readonly db: Db) {}

  async mapHints(hints: VisionCatalogHints): Promise<VisionInferenceResult | null> {
    const clubMatch = hints.clubHint ? await this.resolveClub(hints.clubHint) : null;
    const seasonMatch =
      clubMatch && hints.seasonHint
        ? await this.resolveSeason(clubMatch.clubId, hints.seasonHint)
        : null;

    let catalogKitId: string | undefined;
    if (clubMatch && seasonMatch && hints.kitType) {
      catalogKitId = await this.resolveCatalogKit(
        clubMatch.clubId,
        seasonMatch.seasonId,
        hints.kitType,
      );
    }

    const playerMatch =
      clubMatch && seasonMatch
        ? await this.resolvePlayer(
            clubMatch.clubId,
            seasonMatch.seasonId,
            hints.playerNumberHint,
            hints.playerHint,
          )
        : null;

    const patchMatch = seasonMatch
      ? await this.resolvePatch(seasonMatch.seasonId, hints.patchHint)
      : null;

    const clubId = clubMatch?.clubId;
    const seasonId = seasonMatch?.seasonId;
    const type = hints.kitType;

    if (!clubId && !seasonId && !type && !playerMatch && !patchMatch) {
      if (hints.clubHint) {
        return {
          clubHint: hints.clubHint,
          visionRaw: JSON.stringify(hints),
          confidences: this.buildConfidences(hints.confidence, {}),
        };
      }
      return null;
    }

    return {
      clubId,
      seasonId,
      catalogKitId,
      type,
      playerId: playerMatch?.playerId,
      playerNumber: playerMatch?.playerNumber,
      patchId: patchMatch?.patchId,
      clubHint: hints.clubHint,
      confidences: this.buildConfidences(hints.confidence, {
        club: clubMatch?.score,
        season: seasonMatch?.score,
        kitType: type ? 70 : undefined,
        player: playerMatch?.score,
        badge: patchMatch?.score,
      }),
    };
  }

  private async resolveClub(hint: string): Promise<ClubMatch | null> {
    const pattern = `%${hint.trim()}%`;

    const labelRows = await this.db
      .selectDistinct({
        entityId: catalogLabel.entityId,
        text: catalogLabel.text,
      })
      .from(catalogLabel)
      .where(and(eq(catalogLabel.entityType, "club"), sql`${catalogLabel.text} ilike ${pattern}`))
      .limit(20);

    if (labelRows.length === 0) {
      return null;
    }

    const clubIds = labelRows.map((row) => row.entityId);
    const existingClubs = await this.db
      .select({ id: club.id })
      .from(club)
      .where(inArray(club.id, clubIds));

    const validClubIds = new Set(existingClubs.map((row) => row.id));
    const scored = labelRows
      .filter((row: { entityId: string }) => validClubIds.has(row.entityId))
      .map((row: { entityId: string; text: string | null }) => ({
        clubId: row.entityId,
        score: scoreLabelMatch(row.text ?? "", hint),
      }))
      .filter((row: { score: number }) => row.score > 0)
      .sort((a: { score: number }, b: { score: number }) => b.score - a.score);

    return scored[0] ?? null;
  }

  private async resolveSeason(clubId: string, hint: string): Promise<SeasonMatch | null> {
    const pattern = `%${hint.trim()}%`;

    const seasonRows = await this.db
      .select({ seasonId: season.id, label: season.label })
      .from(teamSeason)
      .innerJoin(season, eq(teamSeason.seasonId, season.id))
      .where(and(eq(teamSeason.clubId, clubId), sql`${season.label} ilike ${pattern}`))
      .limit(10);

    const scored = seasonRows
      .map((row: { seasonId: string; label: string | null }) => ({
        seasonId: row.seasonId,
        score: scoreLabelMatch(row.label ?? "", hint),
      }))
      .filter((row: { score: number }) => row.score > 0)
      .sort((a: { score: number }, b: { score: number }) => b.score - a.score);

    return scored[0] ?? null;
  }

  private async resolveCatalogKit(
    clubId: string,
    seasonId: string,
    kitType: KitType,
  ): Promise<string | undefined> {
    const [row] = await this.db
      .select({ id: kit.id })
      .from(kit)
      .where(and(eq(kit.clubId, clubId), eq(kit.seasonId, seasonId), eq(kit.type, kitType)))
      .limit(1);

    return row?.id;
  }

  private async resolvePlayer(
    clubId: string,
    seasonId: string,
    numberHint?: string,
    nameHint?: string,
  ): Promise<PlayerMatch | null> {
    if (numberHint?.trim()) {
      const parsedNumber = Number.parseInt(numberHint.trim(), 10);
      if (!Number.isNaN(parsedNumber)) {
        const [row] = await this.db
          .select({
            playerId: playerClubSeason.playerId,
            squadNumber: playerClubSeason.squadNumber,
          })
          .from(playerClubSeason)
          .where(
            and(
              eq(playerClubSeason.clubId, clubId),
              eq(playerClubSeason.seasonId, seasonId),
              eq(playerClubSeason.squadNumber, parsedNumber),
            ),
          )
          .limit(1);

        if (row) {
          return {
            playerId: row.playerId,
            playerNumber: String(row.squadNumber ?? parsedNumber),
            score: 90,
          };
        }
      }
    }

    if (!nameHint?.trim()) {
      return null;
    }

    const pattern = `%${nameHint.trim()}%`;
    const labelRows = await this.db
      .selectDistinct({
        entityId: catalogLabel.entityId,
        text: catalogLabel.text,
      })
      .from(catalogLabel)
      .where(and(eq(catalogLabel.entityType, "player"), sql`${catalogLabel.text} ilike ${pattern}`))
      .limit(20);

    if (labelRows.length === 0) {
      return null;
    }

    const playerIds = labelRows.map((row) => row.entityId);
    const scopedRows = await this.db
      .select({
        playerId: playerClubSeason.playerId,
        squadNumber: playerClubSeason.squadNumber,
      })
      .from(playerClubSeason)
      .where(
        and(
          eq(playerClubSeason.clubId, clubId),
          eq(playerClubSeason.seasonId, seasonId),
          inArray(playerClubSeason.playerId, playerIds),
        ),
      );

    const scored = scopedRows
      .map((row) => {
        const label = labelRows.find((entry) => entry.entityId === row.playerId)?.text ?? "";
        return {
          playerId: row.playerId,
          playerNumber: row.squadNumber ? String(row.squadNumber) : undefined,
          score: scoreLabelMatch(label, nameHint),
        };
      })
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored[0] ?? null;
  }

  private async resolvePatch(seasonId: string, hint?: string): Promise<PatchMatch | null> {
    if (!hint?.trim()) {
      return null;
    }

    const pattern = `%${hint.trim()}%`;
    const labelRows = await this.db
      .selectDistinct({
        entityId: catalogLabel.entityId,
        text: catalogLabel.text,
      })
      .from(catalogLabel)
      .innerJoin(patch, eq(patch.id, catalogLabel.entityId))
      .where(
        and(
          eq(catalogLabel.entityType, "patch"),
          eq(patch.seasonId, seasonId),
          sql`${catalogLabel.text} ilike ${pattern}`,
        ),
      )
      .limit(10);

    const scored = labelRows
      .map((row) => ({
        patchId: row.entityId,
        score: scoreLabelMatch(row.text ?? "", hint),
      }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored[0] ?? null;
  }

  private buildConfidences(
    modelConfidence: number | undefined,
    fields: {
      club?: number;
      season?: number;
      kitType?: number;
      player?: number;
      badge?: number;
    },
  ): VisionFieldConfidences {
    const fieldScores = [
      fields.club,
      fields.season,
      fields.kitType,
      fields.player,
      fields.badge,
    ].filter((score): score is number => typeof score === "number");
    const overallFromFields =
      fieldScores.length > 0
        ? Math.round(fieldScores.reduce((sum, score) => sum + score, 0) / fieldScores.length)
        : 0;
    const modelOverall = computeOverallConfidence(modelConfidence);

    return {
      overall: modelOverall > 0 ? modelOverall : overallFromFields,
      club: fields.club,
      season: fields.season,
      kitType: fields.kitType,
      player: fields.player,
      badge: fields.badge,
    };
  }
}
