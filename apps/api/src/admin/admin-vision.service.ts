import {
  type AdminVisionLabelList,
  type AdminVisionLabelQuery,
  adminVisionLabelListSchema,
  visionEvalFieldHitsSchema,
} from "@kit/api-contract";
import type { Db } from "@kit/db";
import { catalogLabel, season, visionLog } from "@kit/db";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { and, count, desc, eq, inArray, isNotNull, type SQL } from "drizzle-orm";
import { DB } from "../db/db.module.js";

function pickAdminLabel(
  rows: Array<{ locale: string | null; kind: string | null; label: string | null }>,
): string | undefined {
  return (
    rows.find((row) => row.locale === "en" && row.kind === "label")?.label ??
    rows.find((row) => row.locale === "mul" && row.kind === "label")?.label ??
    rows.find((row) => row.locale === "da" && row.kind === "label")?.label ??
    rows.find((row) => row.kind === "alias")?.label ??
    undefined
  );
}

function parsePhotoKeys(raw: string | null): string[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
  } catch {
    return [];
  }
}

function emptyFieldHits() {
  return {
    side: false,
    season: false,
    type: false,
    catalogKitId: false,
    player: false,
    patch: false,
  };
}

function parseFieldHits(raw: string | null) {
  if (!raw) {
    return emptyFieldHits();
  }
  try {
    return visionEvalFieldHitsSchema.parse(JSON.parse(raw));
  } catch {
    return emptyFieldHits();
  }
}

type IdentityIds = {
  clubId: string | null;
  nationalTeamId: string | null;
  seasonId: string | null;
  playerId: string | null;
  patchId: string | null;
};

@Injectable()
export class AdminVisionService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async listLabels(query: AdminVisionLabelQuery): Promise<AdminVisionLabelList> {
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;
    const filters: SQL[] = [eq(visionLog.kind, "identity"), isNotNull(visionLog.evalClass)];
    if (query.class) {
      filters.push(eq(visionLog.evalClass, query.class));
    }
    const userActionFilter = query.userAction ?? query.user_action;
    if (userActionFilter) {
      filters.push(eq(visionLog.userAction, userActionFilter));
    }
    const where = and(...filters);

    const [filtered] = await this.db.select({ total: count() }).from(visionLog).where(where);
    const [labelled] = await this.db
      .select({ labelledCount: count() })
      .from(visionLog)
      .where(and(eq(visionLog.kind, "identity"), isNotNull(visionLog.evalClass)));
    const [accepted] = await this.db
      .select({ acceptedCount: count() })
      .from(visionLog)
      .where(and(eq(visionLog.kind, "identity"), eq(visionLog.evalClass, "accepted")));

    const total = Number(filtered?.total ?? 0);
    const labelledCount = Number(labelled?.labelledCount ?? 0);
    const acceptedCount = Number(accepted?.acceptedCount ?? 0);

    const rows = await this.db
      .select({
        jobId: visionLog.id,
        createdAt: visionLog.createdAt,
        evalClass: visionLog.evalClass,
        userAction: visionLog.userAction,
        suggestedClubId: visionLog.suggestedClubId,
        suggestedNationalTeamId: visionLog.suggestedNationalTeamId,
        suggestedSeasonId: visionLog.suggestedSeasonId,
        suggestedType: visionLog.suggestedType,
        suggestedCatalogKitId: visionLog.suggestedCatalogKitId,
        suggestedPlayerId: visionLog.suggestedPlayerId,
        suggestedPatchId: visionLog.suggestedPatchId,
        selectedClubId: visionLog.selectedClubId,
        selectedNationalTeamId: visionLog.selectedNationalTeamId,
        selectedSeasonId: visionLog.selectedSeasonId,
        selectedType: visionLog.selectedType,
        selectedCatalogKitId: visionLog.selectedCatalogKitId,
        selectedPlayerId: visionLog.selectedPlayerId,
        selectedPatchId: visionLog.selectedPatchId,
        fieldHits: visionLog.fieldHits,
        latencyMs: visionLog.latencyMs,
        model: visionLog.model,
        photoKeys: visionLog.photoKeys,
      })
      .from(visionLog)
      .where(where)
      .orderBy(desc(visionLog.createdAt))
      .limit(limit)
      .offset(offset);

    const labels = await this.loadIdentityLabels(
      rows.flatMap((row) => [
        {
          clubId: row.suggestedClubId,
          nationalTeamId: row.suggestedNationalTeamId,
          seasonId: row.suggestedSeasonId,
          playerId: row.suggestedPlayerId,
          patchId: row.suggestedPatchId,
        },
        {
          clubId: row.selectedClubId,
          nationalTeamId: row.selectedNationalTeamId,
          seasonId: row.selectedSeasonId,
          playerId: row.selectedPlayerId,
          patchId: row.selectedPatchId,
        },
      ]),
    );

    return adminVisionLabelListSchema.parse({
      total,
      acceptedCount,
      labelledCount,
      hitRateCaption: `${acceptedCount} / ${labelledCount}`,
      rows: rows.map((row) => {
        if (!row.evalClass) {
          throw new BadRequestException("Vision label missing eval class");
        }
        return {
          jobId: row.jobId,
          createdAt: row.createdAt.toISOString(),
          class: row.evalClass,
          userAction: row.userAction,
          suggested: this.toIdentity(row, "suggested", labels),
          selected: this.toIdentity(row, "selected", labels),
          fieldHits: parseFieldHits(row.fieldHits),
          latencyMs: row.latencyMs,
          model: row.model,
          photoKeys: parsePhotoKeys(row.photoKeys),
        };
      }),
    });
  }

  private toIdentity(
    row: {
      suggestedClubId: string | null;
      suggestedNationalTeamId: string | null;
      suggestedSeasonId: string | null;
      suggestedType: string | null;
      suggestedCatalogKitId: string | null;
      suggestedPlayerId: string | null;
      suggestedPatchId: string | null;
      selectedClubId: string | null;
      selectedNationalTeamId: string | null;
      selectedSeasonId: string | null;
      selectedType: string | null;
      selectedCatalogKitId: string | null;
      selectedPlayerId: string | null;
      selectedPatchId: string | null;
    },
    side: "suggested" | "selected",
    labels: Map<string, string>,
  ) {
    const clubId = side === "suggested" ? row.suggestedClubId : row.selectedClubId;
    const nationalTeamId =
      side === "suggested" ? row.suggestedNationalTeamId : row.selectedNationalTeamId;
    const seasonId = side === "suggested" ? row.suggestedSeasonId : row.selectedSeasonId;
    const type = side === "suggested" ? row.suggestedType : row.selectedType;
    const catalogKitId =
      side === "suggested" ? row.suggestedCatalogKitId : row.selectedCatalogKitId;
    const playerId = side === "suggested" ? row.suggestedPlayerId : row.selectedPlayerId;
    const patchId = side === "suggested" ? row.suggestedPatchId : row.selectedPatchId;
    return {
      ...(clubId ? { clubId, ...labelPair("club", clubId, labels) } : {}),
      ...(nationalTeamId
        ? {
            nationalTeamId,
            ...labelPair("national_team", nationalTeamId, labels, "nationalTeamLabel"),
          }
        : {}),
      ...(seasonId ? { seasonId, ...labelPair("season", seasonId, labels, "seasonLabel") } : {}),
      ...(type ? { type } : {}),
      ...(catalogKitId ? { catalogKitId } : {}),
      ...(playerId ? { playerId, ...labelPair("player", playerId, labels, "playerLabel") } : {}),
      ...(patchId ? { patchId, ...labelPair("patch", patchId, labels, "patchLabel") } : {}),
    };
  }

  private async loadIdentityLabels(identities: IdentityIds[]): Promise<Map<string, string>> {
    const labels = new Map<string, string>();
    await this.loadCatalogLabels(labels, "club", uniqueIds(identities.map((row) => row.clubId)));
    await this.loadCatalogLabels(
      labels,
      "national_team",
      uniqueIds(identities.map((row) => row.nationalTeamId)),
    );
    await this.loadCatalogLabels(
      labels,
      "player",
      uniqueIds(identities.map((row) => row.playerId)),
    );
    await this.loadCatalogLabels(labels, "patch", uniqueIds(identities.map((row) => row.patchId)));

    const seasonIds = uniqueIds(identities.map((row) => row.seasonId));
    if (seasonIds.length > 0) {
      const seasonRows = await this.db
        .select({ id: season.id, label: season.label })
        .from(season)
        .where(inArray(season.id, seasonIds));
      for (const row of seasonRows) {
        labels.set(`season:${row.id}`, row.label);
      }
    }

    return labels;
  }

  private async loadCatalogLabels(
    labels: Map<string, string>,
    entityType: "club" | "national_team" | "player" | "patch",
    entityIds: string[],
  ): Promise<void> {
    if (entityIds.length === 0) {
      return;
    }
    const rows = await this.db
      .select({
        entityId: catalogLabel.entityId,
        label: catalogLabel.text,
        locale: catalogLabel.locale,
        kind: catalogLabel.kind,
      })
      .from(catalogLabel)
      .where(
        and(eq(catalogLabel.entityType, entityType), inArray(catalogLabel.entityId, entityIds)),
      );

    for (const entityId of entityIds) {
      const resolved = pickAdminLabel(rows.filter((row) => row.entityId === entityId));
      if (resolved) {
        labels.set(`${entityType}:${entityId}`, resolved);
      }
    }
  }
}

function uniqueIds(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function labelPair(
  entityType: string,
  entityId: string,
  labels: Map<string, string>,
  field = `${entityType}Label`,
) {
  const label = labels.get(`${entityType}:${entityId}`);
  return label ? { [field]: label } : {};
}
