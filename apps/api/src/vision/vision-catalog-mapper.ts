import type { Db } from "@kit/db";
import { catalogLabel, club, kit, manufacturer, patch, playerClubSeason, season } from "@kit/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { IdentityVisionHints } from "./identity-vision-prompt.js";
import type { VisionFieldConfidences, VisionInferenceResult } from "./vision.adapter.js";
import { combineModelAndMatchConfidence, computeOverallConfidence } from "./vision-confidence.js";
import {
  CATALOG_KIT_LOCK_CONFIDENCE,
  type ObservableKitHit,
  pickRefinedKit,
  pickUniqueKitByObservables,
  resolveObservableKitLock,
  scoreLabelMatch,
} from "./vision-kit-lock.js";

export type VisionCatalogHints = IdentityVisionHints;

export type VisionMapOptions = {
  amongKitIds?: string[];
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

export class VisionCatalogMapper {
  constructor(private readonly db: Db) {}

  async mapHints(
    hints: VisionCatalogHints,
    options: VisionMapOptions = {},
  ): Promise<VisionInferenceResult | null> {
    const clubMatch = hints.clubHint ? await this.resolveClub(hints.clubHint) : null;
    const hits = await this.listObservableKitHits(hints, clubMatch?.clubId);

    const locked = options.amongKitIds?.length
      ? pickRefinedKit(hits, options.amongKitIds, hints.seasonHint, hints.kitType)
      : (() => {
          const lock = resolveObservableKitLock(hits, clubMatch?.clubId);
          if (lock.status === "unique") {
            return lock.kit;
          }
          if (lock.status === "ambiguous") {
            return pickUniqueKitByObservables(lock.kits, hints.kitType, hints.colorHint);
          }
          return null;
        })();

    const clubId = locked?.clubId ?? clubMatch?.clubId ?? undefined;
    const seasonId = locked?.seasonId;
    const type = locked?.type;
    const catalogKitId = locked?.kitId;

    const playerMatch =
      clubId && seasonId
        ? await this.resolvePlayer(clubId, seasonId, hints.playerNumberHint, hints.playerHint)
        : null;

    const patchMatch = seasonId ? await this.resolvePatch(seasonId, hints.patchHint) : null;

    if (!clubId && !seasonId && !type && !playerMatch && !patchMatch) {
      if (hints.clubHint) {
        return {
          clubHint: hints.clubHint,
          visionRaw: JSON.stringify(hints),
          confidences: this.buildConfidences(hints, {}),
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
      confidences: this.buildConfidences(hints, {
        club: clubMatch?.score ?? (locked ? CATALOG_KIT_LOCK_CONFIDENCE : undefined),
        season: locked ? CATALOG_KIT_LOCK_CONFIDENCE : undefined,
        kitType: locked ? CATALOG_KIT_LOCK_CONFIDENCE : undefined,
        player: playerMatch?.score,
        badge: patchMatch?.score,
        kitLocked: Boolean(locked),
      }),
    };
  }

  async listObservableKitHits(
    hints: VisionCatalogHints,
    clubId?: string,
  ): Promise<ObservableKitHit[]> {
    const manufacturerHint = hints.manufacturerHint?.trim();
    const sponsorHint = hints.sponsorHint?.trim();
    if (!manufacturerHint) {
      return [];
    }
    if (!sponsorHint && !clubId) {
      return [];
    }

    const manufacturerPattern = `%${manufacturerHint}%`;
    const sponsorPattern = sponsorHint ? `%${sponsorHint}%` : undefined;

    const rows = await this.db
      .select({
        kitId: kit.id,
        clubId: kit.clubId,
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
          sql`${catalogLabel.text} ilike ${manufacturerPattern}`,
          sponsorPattern
            ? sql`${kit.sponsorName} ilike ${sponsorPattern}`
            : eq(kit.clubId, clubId!),
        ),
      )
      .limit(40);

    return rows
      .filter((row) => {
        if (scoreLabelMatch(row.manufacturerText ?? "", manufacturerHint) <= 0) {
          return false;
        }
        if (sponsorHint) {
          return scoreLabelMatch(row.sponsorName ?? "", sponsorHint) > 0;
        }
        return true;
      })
      .map((row) => ({
        kitId: row.kitId,
        clubId: row.clubId,
        seasonId: row.seasonId,
        seasonLabel: row.seasonLabel,
        type: row.type,
        manufacturer: row.manufacturerText,
        sponsor: row.sponsorName ?? sponsorHint ?? "",
        colorNames: row.colorNames,
      }));
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
    hints: IdentityVisionHints,
    match: {
      club?: number;
      season?: number;
      kitType?: number;
      player?: number;
      badge?: number;
      kitLocked?: boolean;
    },
  ): VisionFieldConfidences {
    const fields = hints.fieldConfidence;
    const club = combineModelAndMatchConfidence(fields?.club, match.club);
    const season = match.kitLocked
      ? CATALOG_KIT_LOCK_CONFIDENCE
      : combineModelAndMatchConfidence(fields?.season, match.season);
    const kitType = match.kitLocked
      ? CATALOG_KIT_LOCK_CONFIDENCE
      : combineModelAndMatchConfidence(fields?.kitType, match.kitType);
    const player = combineModelAndMatchConfidence(fields?.player, match.player);
    const badge = combineModelAndMatchConfidence(fields?.badge, match.badge);
    const fieldScores = [club, season, kitType, player, badge].filter(
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
      season,
      kitType,
      player,
      badge,
    };
  }
}
