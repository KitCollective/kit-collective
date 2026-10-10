import {
  type AdminVisionImproveList,
  type AdminVisionImproveQuery,
  type AdminVisionImproveRow,
  type AdminVisionLabelList,
  type AdminVisionLabelQuery,
  adminVisionImproveListSchema,
  adminVisionImproveRowSchema,
  adminVisionLabelListSchema,
  aliasLocaleForHint,
  visionEvalFieldHitsSchema,
} from "@kit/api-contract";
import type { Db } from "@kit/db";
import { catalogLabel, season, visionImprove, visionLog } from "@kit/db";
import type { CatalogEntityType, VisionImproveEntityType, VisionImproveStatus } from "@kit/domain";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
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

type ApplyAliasCatalogLabelInput = {
  text: string | null;
  entityType: VisionImproveEntityType | null;
  entityId: string | null;
};

type VisionImproveTableRow = {
  id: string;
  kind: AdminVisionImproveRow["kind"];
  status: VisionImproveStatus;
  count: number;
  fingerprint: string;
  text: string | null;
  entityType: VisionImproveEntityType | null;
  entityId: string | null;
  field: AdminVisionImproveRow["field"] | null;
  createdAt: Date;
  updatedAt: Date;
};

type ImproveIdentitySource = {
  text: string | null;
  entityType: VisionImproveEntityType | null;
  entityId: string | null;
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

  async listImprove(query: AdminVisionImproveQuery): Promise<AdminVisionImproveList> {
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;
    const status: VisionImproveStatus = query.status ?? "proposed";
    const [filtered] = await this.db
      .select({ total: count() })
      .from(visionImprove)
      .where(eq(visionImprove.status, status));
    const rows = await this.db
      .select()
      .from(visionImprove)
      .where(eq(visionImprove.status, status))
      .orderBy(desc(visionImprove.updatedAt))
      .limit(limit)
      .offset(offset);
    const labels = await this.loadImproveSelectedLabels(rows);
    return adminVisionImproveListSchema.parse({
      total: Number(filtered?.total ?? 0),
      rows: rows.map((row) => this.toImproveRow(row, labels)),
    });
  }

  async applyImprove(id: string): Promise<AdminVisionImproveRow> {
    const row = await this.requireImprove(id);
    if (row.kind === "alias") {
      await this.applyAliasCatalogLabel(row);
      return this.setImproveStatus(id, "applied");
    }
    return this.setImproveStatus(id, "noted");
  }

  async dismissImprove(id: string): Promise<AdminVisionImproveRow> {
    await this.requireImprove(id);
    return this.setImproveStatus(id, "dismissed");
  }

  private async requireImprove(id: string) {
    const [row] = await this.db
      .select()
      .from(visionImprove)
      .where(eq(visionImprove.id, id))
      .limit(1);
    if (!row) {
      throw new NotFoundException("Vision improve not found");
    }
    return row;
  }

  private async setImproveStatus(
    id: string,
    status: VisionImproveStatus,
  ): Promise<AdminVisionImproveRow> {
    const [updated] = await this.db
      .update(visionImprove)
      .set({ status, updatedAt: new Date() })
      .where(eq(visionImprove.id, id))
      .returning();
    if (!updated) {
      throw new NotFoundException("Vision improve not found");
    }
    const labels = await this.loadImproveSelectedLabels([updated]);
    return this.toImproveRow(updated, labels);
  }

  private async applyAliasCatalogLabel(row: ApplyAliasCatalogLabelInput): Promise<void> {
    const aliasText = row.text?.trim();
    const entityType = row.entityType;
    const entityId = row.entityId;
    if (!aliasText || !entityType || !entityId) {
      throw new BadRequestException("Alias improve needs text, entity type, and entity id");
    }
    if (!isCatalogLabelEntityType(entityType)) {
      throw new BadRequestException("Alias apply needs Club or NationalTeam CatalogLabel");
    }
    const existing = await this.db
      .select({ id: catalogLabel.id })
      .from(catalogLabel)
      .where(
        and(
          eq(catalogLabel.entityType, entityType),
          eq(catalogLabel.entityId, entityId),
          eq(catalogLabel.kind, "alias"),
          eq(catalogLabel.text, aliasText),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      return;
    }
    await this.db.insert(catalogLabel).values({
      entityType,
      entityId,
      locale: aliasLocaleForHint(aliasText),
      kind: "alias",
      text: aliasText,
      source: "admin",
    });
  }

  private toImproveRow(
    row: VisionImproveTableRow,
    labels: Map<string, string>,
  ): AdminVisionImproveRow {
    const lastSeenAt = row.updatedAt.toISOString();
    return adminVisionImproveRowSchema.parse({
      id: row.id,
      kind: row.kind,
      status: row.status,
      count: row.count,
      fingerprint: row.fingerprint,
      ...(row.text ? { text: row.text } : {}),
      ...(row.entityType ? { entityType: row.entityType } : {}),
      ...(row.entityId ? { entityId: row.entityId } : {}),
      ...(row.field ? { field: row.field } : {}),
      createdAt: row.createdAt.toISOString(),
      updatedAt: lastSeenAt,
      suggested: improveSuggestedIdentity(row),
      selected: improveSelectedIdentity(row, labels),
      lastSeenAt,
    });
  }

  private async loadImproveSelectedLabels(
    rows: Array<{ entityType: VisionImproveEntityType | null; entityId: string | null }>,
  ): Promise<Map<string, string>> {
    const labels = new Map<string, string>();
    const byType = new Map<VisionImproveEntityType, string[]>();
    for (const row of rows) {
      if (!row.entityType || !row.entityId) {
        continue;
      }
      const current = byType.get(row.entityType) ?? [];
      current.push(row.entityId);
      byType.set(row.entityType, current);
    }
    for (const entityType of ["club", "national_team", "player", "patch"] as const) {
      await this.loadCatalogLabels(labels, entityType, uniqueIds(byType.get(entityType) ?? []));
    }
    const seasonIds = uniqueIds(byType.get("season") ?? []);
    if (seasonIds.length > 0) {
      const seasonRows = await this.db
        .select({ id: season.id, label: season.label })
        .from(season)
        .where(inArray(season.id, seasonIds));
      for (const seasonRow of seasonRows) {
        labels.set(`season:${seasonRow.id}`, seasonRow.label);
      }
    }
    return labels;
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

function isCatalogLabelEntityType(
  entityType: VisionImproveEntityType,
): entityType is CatalogEntityType & ("club" | "national_team" | "player" | "patch") {
  return (
    entityType === "club" ||
    entityType === "national_team" ||
    entityType === "player" ||
    entityType === "patch"
  );
}

function improveSuggestedIdentity(row: ImproveIdentitySource) {
  if (!row.text) {
    return {};
  }
  return identityFromEntity(row.entityType, undefined, row.text);
}

function improveSelectedIdentity(row: ImproveIdentitySource, labels: Map<string, string>) {
  if (!row.entityType || !row.entityId) {
    return {};
  }
  const label = labels.get(`${row.entityType}:${row.entityId}`);
  return identityFromEntity(row.entityType, row.entityId, label);
}

function identityFromEntity(
  entityType: VisionImproveEntityType | null,
  entityId: string | undefined,
  label: string | undefined,
) {
  if (entityType === "club") {
    return {
      ...(entityId ? { clubId: entityId } : {}),
      ...(label ? { clubLabel: label } : {}),
    };
  }
  if (entityType === "national_team") {
    return {
      ...(entityId ? { nationalTeamId: entityId } : {}),
      ...(label ? { nationalTeamLabel: label } : {}),
    };
  }
  if (entityType === "season") {
    return {
      ...(entityId ? { seasonId: entityId } : {}),
      ...(label ? { seasonLabel: label } : {}),
    };
  }
  if (entityType === "kit") {
    return {
      ...(entityId ? { catalogKitId: entityId } : {}),
      ...(label ? { catalogKitLabel: label } : {}),
    };
  }
  if (entityType === "player") {
    return {
      ...(entityId ? { playerId: entityId } : {}),
      ...(label ? { playerLabel: label } : {}),
    };
  }
  if (entityType === "patch") {
    return {
      ...(entityId ? { patchId: entityId } : {}),
      ...(label ? { patchLabel: label } : {}),
    };
  }
  return label ? { clubLabel: label } : {};
}
