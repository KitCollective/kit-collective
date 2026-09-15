import {
  classifyVisionEval,
  proposeVisionImprove,
  resolveVisionSaveAction,
  type VisionEvalEntityHints,
  type VisionGroupingSuggestions,
  type VisionImproveProposal,
  type VisionJobKind,
  type VisionJobStatus,
  type VisionSuggestions,
  type VisionUserAction,
} from "@kit/api-contract";
import type { Db } from "@kit/db";
import {
  catalogLabel,
  playerClubSeason,
  playerNationalTeamSeason,
  season,
  userJerseyPhoto,
  visionImprove,
  visionLog,
} from "@kit/db";
import type { KitType, LabelKind, LabelLocale } from "@kit/domain";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { DB } from "../db/db.module.js";
import type {
  VisionAdapter,
  VisionGroupingPhotoInput,
  VisionIdentityPhotoInput,
  VisionInferenceResult,
} from "./vision.adapter.js";
import { VISION_ADAPTER } from "./vision.adapter.js";
import {
  parseClubHintFromVisionRaw,
  parseConfidences,
  parseVisionEvalHints,
  parseZeroKitHits,
  resolveIdentityJob,
  serializeConfidences,
} from "./vision-confidence.js";
import {
  parseGroupingResult,
  resolveGroupingStatus,
  serializeGroupingResult,
  shouldPreselectGrouping,
} from "./vision-grouping-confidence.js";

export const VISION_QUEUE_NAME = "vision";

export type PersistVisionLabelSelected = {
  clubId?: string;
  nationalTeamId?: string;
  seasonId: string;
  type: KitType;
  catalogKitId?: string | null;
  playerId?: string;
  patchId?: string;
};

export type VisionJobPayload = {
  jobId: string;
  userId: string;
  kind: VisionJobKind;
  draftId?: string;
  sessionId?: string;
  identityPhotos?: VisionIdentityPhotoInput[];
  groupingPhotos?: VisionGroupingPhotoInput[];
  groupingPriorGroups?: Array<{ photoIds: string[] }>;
};

@Injectable()
export class VisionService {
  private readonly logger = new Logger(VisionService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(VISION_ADAPTER) private readonly adapter: VisionAdapter,
  ) {}

  async createJob(
    userId: string,
    options: {
      kind?: VisionJobKind;
      draftId?: string;
      sessionId?: string;
    } = {},
  ): Promise<string> {
    const [row] = await this.db
      .insert(visionLog)
      .values({
        userId,
        draftId: options.draftId ?? null,
        kind: options.kind ?? "identity",
        status: "pending",
      })
      .returning({ id: visionLog.id });

    if (!row) {
      throw new Error("Could not create vision job");
    }

    return row.id;
  }

  enqueueJob(payload: VisionJobPayload, enqueue: (payload: VisionJobPayload) => void): void {
    enqueue(payload);
  }

  async processJob(payload: VisionJobPayload): Promise<void> {
    if (payload.kind === "grouping") {
      await this.processGroupingJob(payload);
      return;
    }

    let result: VisionInferenceResult | null = null;
    let status: VisionJobStatus = "noop";

    try {
      const photos = payload.identityPhotos ?? [];
      if (photos.length === 0) {
        throw new Error("Identity vision job missing photo bytes");
      }
      result = await this.adapter.infer(photos);
      const resolved = resolveIdentityJob(result);
      status = resolved.status;
      result = resolved.storedResult;
    } catch {
      status = "failed";
    }

    try {
      await this.db
        .update(visionLog)
        .set({
          status,
          suggestedClubId: result?.clubId ?? null,
          suggestedNationalTeamId: result?.nationalTeamId ?? null,
          suggestedSeasonId: result?.seasonId ?? null,
          suggestedCatalogKitId: result?.catalogKitId ?? null,
          suggestedType: result?.type ?? null,
          suggestedPlayerId: result?.playerId ?? null,
          suggestedPatchId: result?.patchId ?? null,
          visionRaw: result?.visionRaw ?? null,
          confidences: result?.confidences ? serializeConfidences(result.confidences) : null,
          latencyMs: result?.latencyMs ?? null,
          model: result?.model ?? null,
          updatedAt: new Date(),
        })
        .where(eq(visionLog.id, payload.jobId));
    } catch {
      // Fail open — a late or orphaned worker must not reject the Save path.
    }
  }

  private async processGroupingJob(payload: VisionJobPayload): Promise<void> {
    let status: VisionJobStatus = "noop";
    let grouping: VisionGroupingSuggestions | null = null;

    try {
      const photos = payload.groupingPhotos ?? [];
      if (!this.adapter.inferGrouping || photos.length < 2) {
        status = "noop";
      } else {
        const result = await this.adapter.inferGrouping(photos, {
          priorGroups: payload.groupingPriorGroups,
        });
        const resolved = resolveGroupingStatus(result);
        status = resolved.status;
        if (resolved.result) {
          grouping = {
            groups: resolved.result.groups.map((group) => ({
              photoIds: group.photoIds,
              confidence: group.confidence,
            })),
          };
        }
      }
    } catch {
      status = "failed";
    }

    try {
      await this.db
        .update(visionLog)
        .set({
          status,
          groupingResult: grouping ? serializeGroupingResult(grouping) : null,
          confidences: grouping
            ? serializeConfidences({
                overall: Math.min(
                  ...(grouping.groups.map((group) => group.confidence ?? 0) ?? [0]),
                ),
              })
            : null,
          updatedAt: new Date(),
        })
        .where(eq(visionLog.id, payload.jobId));
    } catch {
      // Fail open — grouping must not block Save.
    }
  }

  async findActiveJobForDraft(userId: string, draftId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: visionLog.id })
      .from(visionLog)
      .where(
        and(
          eq(visionLog.userId, userId),
          eq(visionLog.draftId, draftId),
          inArray(visionLog.status, ["pending", "ready"]),
        ),
      )
      .orderBy(desc(visionLog.createdAt))
      .limit(1);

    return row?.id ?? null;
  }

  async getJob(
    userId: string,
    jobId: string,
    locale: LabelLocale = "da",
  ): Promise<{
    jobId: string;
    status: VisionJobStatus;
    kind?: VisionJobKind;
    preselect?: boolean;
    fieldPreselect?: {
      club?: boolean;
      nationalTeam?: boolean;
      season?: boolean;
      type?: boolean;
      player?: boolean;
      badge?: boolean;
    };
    catalogMiss?: boolean;
    clubHint?: string;
    nationalTeamHint?: string;
    suggestions?: VisionSuggestions;
    grouping?: VisionGroupingSuggestions;
  } | null> {
    const [row] = await this.db
      .select({
        id: visionLog.id,
        userId: visionLog.userId,
        kind: visionLog.kind,
        status: visionLog.status,
        suggestedClubId: visionLog.suggestedClubId,
        suggestedNationalTeamId: visionLog.suggestedNationalTeamId,
        suggestedSeasonId: visionLog.suggestedSeasonId,
        suggestedCatalogKitId: visionLog.suggestedCatalogKitId,
        suggestedType: visionLog.suggestedType,
        suggestedPlayerId: visionLog.suggestedPlayerId,
        suggestedPatchId: visionLog.suggestedPatchId,
        confidences: visionLog.confidences,
        groupingResult: visionLog.groupingResult,
        visionRaw: visionLog.visionRaw,
      })
      .from(visionLog)
      .where(eq(visionLog.id, jobId))
      .limit(1);

    if (!row || row.userId !== userId) {
      return null;
    }

    if (row.status !== "ready") {
      return {
        jobId: row.id,
        status: row.status,
        kind: row.kind,
      };
    }

    if (row.kind === "grouping") {
      const grouping = parseGroupingResult(row.groupingResult);
      if (!grouping) {
        return {
          jobId: row.id,
          status: row.status,
          kind: row.kind,
        };
      }

      const confidences = parseConfidences(row.confidences);
      const overall = confidences?.overall ?? 0;
      return {
        jobId: row.id,
        status: row.status,
        kind: row.kind,
        preselect: shouldPreselectGrouping(overall),
        grouping,
      };
    }

    const confidences = parseConfidences(row.confidences);
    const clubHint = parseClubHintFromVisionRaw(row.visionRaw);
    const resolved = resolveIdentityJob({
      clubId: row.suggestedClubId ?? undefined,
      nationalTeamId: row.suggestedNationalTeamId ?? undefined,
      seasonId: row.suggestedSeasonId ?? undefined,
      catalogKitId: row.suggestedCatalogKitId ?? undefined,
      type: row.suggestedType ?? undefined,
      playerId: row.suggestedPlayerId ?? undefined,
      patchId: row.suggestedPatchId ?? undefined,
      clubHint,
      confidences: confidences ?? undefined,
    });

    const clubLabel = row.suggestedClubId
      ? await this.resolveEntityLabel("club", row.suggestedClubId, locale)
      : undefined;
    const nationalTeamLabel = row.suggestedNationalTeamId
      ? await this.resolveEntityLabel("national_team", row.suggestedNationalTeamId, locale)
      : undefined;
    const seasonLabel = row.suggestedSeasonId
      ? await this.resolveSeasonLabel(row.suggestedSeasonId)
      : undefined;
    const playerLabel = row.suggestedPlayerId
      ? await this.resolveEntityLabel("player", row.suggestedPlayerId, locale)
      : undefined;
    const patchLabel = row.suggestedPatchId
      ? await this.resolveEntityLabel("patch", row.suggestedPatchId, locale)
      : undefined;

    const suggestions: VisionSuggestions = {
      ...resolved.suggestions,
      clubLabel: clubLabel ?? undefined,
      nationalTeamLabel: nationalTeamLabel ?? undefined,
      seasonLabel: seasonLabel ?? undefined,
      playerLabel: playerLabel ?? undefined,
      patchLabel: patchLabel ?? undefined,
    };

    if (suggestions.playerId && !suggestions.playerNumber && row.suggestedSeasonId) {
      if (row.suggestedClubId) {
        const [squadRow] = await this.db
          .select({ squadNumber: playerClubSeason.squadNumber })
          .from(playerClubSeason)
          .where(
            and(
              eq(playerClubSeason.playerId, suggestions.playerId),
              eq(playerClubSeason.clubId, row.suggestedClubId),
              eq(playerClubSeason.seasonId, row.suggestedSeasonId),
            ),
          )
          .limit(1);
        if (squadRow?.squadNumber != null) {
          suggestions.playerNumber = String(squadRow.squadNumber);
        }
      } else if (row.suggestedNationalTeamId) {
        const [squadRow] = await this.db
          .select({ squadNumber: playerNationalTeamSeason.squadNumber })
          .from(playerNationalTeamSeason)
          .where(
            and(
              eq(playerNationalTeamSeason.playerId, suggestions.playerId),
              eq(playerNationalTeamSeason.nationalTeamId, row.suggestedNationalTeamId),
              eq(playerNationalTeamSeason.seasonId, row.suggestedSeasonId),
            ),
          )
          .limit(1);
        if (squadRow?.squadNumber != null) {
          suggestions.playerNumber = String(squadRow.squadNumber);
        }
      }
    }

    const hasSuggestions = Boolean(
      suggestions.clubId ||
        suggestions.nationalTeamId ||
        suggestions.seasonId ||
        suggestions.type ||
        suggestions.catalogKitId ||
        suggestions.playerId ||
        suggestions.patchId,
    );

    return {
      jobId: row.id,
      status: row.status,
      kind: row.kind,
      preselect: resolved.preselect,
      fieldPreselect: resolved.fieldPreselect,
      catalogMiss: resolved.catalogMiss || undefined,
      clubHint: resolved.clubHint,
      nationalTeamHint: resolved.nationalTeamHint,
      suggestions: hasSuggestions ? suggestions : undefined,
    };
  }

  private async resolveEntityLabel(
    entityType: "club" | "national_team" | "player" | "patch",
    entityId: string,
    locale: LabelLocale,
  ): Promise<string | null> {
    const rows = await this.db
      .select({ label: catalogLabel.text, locale: catalogLabel.locale, kind: catalogLabel.kind })
      .from(catalogLabel)
      .where(and(eq(catalogLabel.entityType, entityType), eq(catalogLabel.entityId, entityId)));

    const entityLabels = rows.filter((row) => row.label);
    return (
      entityLabels.find((row) => row.locale === locale && row.kind === "label")?.label ??
      entityLabels.find((row) => row.locale === "mul" && row.kind === "label")?.label ??
      entityLabels.find((row) => row.locale === "en" && row.kind === "label")?.label ??
      null
    );
  }

  private async resolveSeasonLabel(seasonId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ label: season.label })
      .from(season)
      .where(eq(season.id, seasonId))
      .limit(1);
    return row?.label ?? null;
  }

  async logUserAction(
    userId: string,
    jobId: string,
    action: VisionUserAction,
    userJerseyId?: string,
  ): Promise<boolean> {
    const [row] = await this.db
      .select({ id: visionLog.id, userId: visionLog.userId })
      .from(visionLog)
      .where(eq(visionLog.id, jobId))
      .limit(1);

    if (!row || row.userId !== userId) {
      return false;
    }

    await this.db
      .update(visionLog)
      .set({
        userAction: action,
        userJerseyId: userJerseyId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(visionLog.id, jobId));

    return true;
  }

  /**
   * Records the terminal userAction on a VisionLog row at Save time.
   * Server-side guarantee — does not rely on client follow-up logging.
   */
  async reconcileUserActionAtSave(
    userId: string,
    jobId: string,
    userJerseyId: string,
    selectedClubId: string | undefined,
    selectedNationalTeamId: string | undefined,
    selectedSeasonId: string,
    selectedKitType: KitType,
  ): Promise<void> {
    const job = await this.getJob(userId, jobId);
    if (!job || job.kind === "grouping") {
      return;
    }

    const resolved = resolveVisionSaveAction({
      status: job.status,
      suggestions: job.suggestions,
      selectedClubId,
      selectedNationalTeamId,
      selectedSeasonId,
      selectedKitType: selectedKitType,
    });

    await this.logUserAction(userId, jobId, resolved.action, userJerseyId);
  }

  /**
   * Snapshots suggested versus selected identity fields on the job after UserJersey commit.
   * Later PATCH of the live UserJersey must not rewrite this row (evalClass already set).
   */
  async persistVisionLabelAtSave(
    userId: string,
    jobId: string,
    userJerseyId: string,
    selected: PersistVisionLabelSelected,
  ): Promise<void> {
    const [row] = await this.db
      .select({
        id: visionLog.id,
        userId: visionLog.userId,
        kind: visionLog.kind,
        status: visionLog.status,
        evalClass: visionLog.evalClass,
        suggestedClubId: visionLog.suggestedClubId,
        suggestedNationalTeamId: visionLog.suggestedNationalTeamId,
        suggestedSeasonId: visionLog.suggestedSeasonId,
        suggestedCatalogKitId: visionLog.suggestedCatalogKitId,
        suggestedType: visionLog.suggestedType,
        suggestedPlayerId: visionLog.suggestedPlayerId,
        suggestedPatchId: visionLog.suggestedPatchId,
        visionRaw: visionLog.visionRaw,
        confidences: visionLog.confidences,
      })
      .from(visionLog)
      .where(eq(visionLog.id, jobId))
      .limit(1);

    if (!row || row.userId !== userId || row.kind !== "identity" || row.evalClass) {
      return;
    }

    const photoRows = await this.db
      .select({ objectKey: userJerseyPhoto.objectKey })
      .from(userJerseyPhoto)
      .where(eq(userJerseyPhoto.userJerseyId, userJerseyId));
    const photoKeys = photoRows.map((photo) => photo.objectKey);

    const selectedCatalogLabels = await this.loadSelectedCatalogLabels(selected);
    const clubHint = parseClubHintFromVisionRaw(row.visionRaw);
    const resolved = resolveIdentityJob({
      clubId: row.suggestedClubId ?? undefined,
      nationalTeamId: row.suggestedNationalTeamId ?? undefined,
      seasonId: row.suggestedSeasonId ?? undefined,
      catalogKitId: row.suggestedCatalogKitId ?? undefined,
      type: row.suggestedType ?? undefined,
      playerId: row.suggestedPlayerId ?? undefined,
      patchId: row.suggestedPatchId ?? undefined,
      clubHint,
      confidences: parseConfidences(row.confidences) ?? undefined,
      visionRaw: row.visionRaw ?? undefined,
    });

    const scored = classifyVisionEval({
      status: row.status,
      suggested: {
        clubId: row.suggestedClubId ?? undefined,
        nationalTeamId: row.suggestedNationalTeamId ?? undefined,
        seasonId: row.suggestedSeasonId ?? undefined,
        type: row.suggestedType ?? undefined,
        catalogKitId: row.suggestedCatalogKitId ?? undefined,
        playerId: row.suggestedPlayerId ?? undefined,
        patchId: row.suggestedPatchId ?? undefined,
      },
      selected: {
        clubId: selected.clubId,
        nationalTeamId: selected.nationalTeamId,
        seasonId: selected.seasonId,
        type: selected.type,
        catalogKitId: selected.catalogKitId ?? undefined,
        playerId: selected.playerId,
        patchId: selected.patchId,
      },
      catalogMiss: resolved.catalogMiss,
      zeroKitHits: parseZeroKitHits(row.visionRaw),
      entityHints: parseVisionEvalHints(row.visionRaw),
      selectedCatalogLabels,
    });

    await this.db
      .update(visionLog)
      .set({
        selectedClubId: selected.clubId ?? null,
        selectedNationalTeamId: selected.nationalTeamId ?? null,
        selectedSeasonId: selected.seasonId,
        selectedType: selected.type,
        selectedCatalogKitId: selected.catalogKitId ?? null,
        selectedPlayerId: selected.playerId ?? null,
        selectedPatchId: selected.patchId ?? null,
        evalClass: scored.evalClass,
        fieldHits: JSON.stringify(scored.fieldHits),
        photoKeys: JSON.stringify(photoKeys),
        userJerseyId,
        updatedAt: new Date(),
      })
      .where(and(eq(visionLog.id, jobId), isNull(visionLog.evalClass)));

    const proposal = proposeVisionImprove({
      evalClass: scored.evalClass,
      suggested: {
        clubId: row.suggestedClubId ?? undefined,
        nationalTeamId: row.suggestedNationalTeamId ?? undefined,
        seasonId: row.suggestedSeasonId ?? undefined,
        type: row.suggestedType ?? undefined,
        catalogKitId: row.suggestedCatalogKitId ?? undefined,
        playerId: row.suggestedPlayerId ?? undefined,
        patchId: row.suggestedPatchId ?? undefined,
      },
      selected: {
        clubId: selected.clubId,
        nationalTeamId: selected.nationalTeamId,
        seasonId: selected.seasonId,
        type: selected.type,
        catalogKitId: selected.catalogKitId ?? undefined,
        playerId: selected.playerId,
        patchId: selected.patchId,
      },
      entityHints: parseVisionEvalHints(row.visionRaw),
      selectedCatalogLabels,
    });
    if (proposal) {
      try {
        await this.upsertVisionImprove(proposal);
      } catch (error) {
        this.logger.error(
          "Vision improve upsert failed after Vision label persist",
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
  }

  private async upsertVisionImprove(proposal: VisionImproveProposal): Promise<void> {
    await this.db
      .insert(visionImprove)
      .values({
        kind: proposal.kind,
        status: "proposed",
        count: 1,
        fingerprint: proposal.fingerprint,
        text: proposal.text ?? null,
        entityType: proposal.entityType ?? null,
        entityId: proposal.entityId ?? null,
        field: proposal.field ?? null,
      })
      .onConflictDoUpdate({
        target: visionImprove.fingerprint,
        set: {
          count: sql`${visionImprove.count} + 1`,
          updatedAt: new Date(),
        },
      });
  }

  private async loadSelectedCatalogLabels(selected: {
    clubId?: string;
    nationalTeamId?: string;
    playerId?: string;
    patchId?: string;
  }): Promise<VisionEvalEntityHints> {
    const entityIds: Array<{
      entityType: "club" | "national_team" | "player" | "patch";
      entityId: string;
    }> = [];
    if (selected.clubId) {
      entityIds.push({ entityType: "club", entityId: selected.clubId });
    }
    if (selected.nationalTeamId) {
      entityIds.push({ entityType: "national_team", entityId: selected.nationalTeamId });
    }
    if (selected.playerId) {
      entityIds.push({ entityType: "player", entityId: selected.playerId });
    }
    if (selected.patchId) {
      entityIds.push({ entityType: "patch", entityId: selected.patchId });
    }

    if (entityIds.length === 0) {
      return {};
    }

    const catalogKinds: LabelKind[] = ["label", "alias"];
    const rows = await this.db
      .select({
        entityType: catalogLabel.entityType,
        text: catalogLabel.text,
      })
      .from(catalogLabel)
      .where(
        and(
          inArray(
            catalogLabel.entityType,
            entityIds.map((entity) => entity.entityType),
          ),
          inArray(
            catalogLabel.entityId,
            entityIds.map((entity) => entity.entityId),
          ),
          inArray(catalogLabel.kind, catalogKinds),
        ),
      );

    const grouped: VisionEvalEntityHints = {};
    for (const row of rows) {
      const text = row.text?.trim();
      if (!text) {
        continue;
      }
      if (row.entityType === "club" || row.entityType === "national_team") {
        grouped.side = [...(grouped.side ?? []), text];
      } else if (row.entityType === "player") {
        grouped.player = [...(grouped.player ?? []), text];
      } else if (row.entityType === "patch") {
        grouped.patch = [...(grouped.patch ?? []), text];
      }
    }
    return grouped;
  }
}
