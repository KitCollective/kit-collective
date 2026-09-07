import {
  resolveVisionSaveAction,
  type VisionGroupingSuggestions,
  type VisionJobKind,
  type VisionJobStatus,
  type VisionSuggestions,
  type VisionUserAction,
} from "@kit/api-contract";
import type { Db } from "@kit/db";
import { catalogLabel, season, visionLog } from "@kit/db";
import type { KitType, LabelLocale } from "@kit/domain";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray } from "drizzle-orm";
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

export type VisionJobPayload = {
  jobId: string;
  userId: string;
  kind: VisionJobKind;
  draftId?: string;
  sessionId?: string;
  identityPhotos?: VisionIdentityPhotoInput[];
  groupingPhotos?: VisionGroupingPhotoInput[];
};

@Injectable()
export class VisionService {
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
        const result = await this.adapter.inferGrouping(photos);
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
    fieldPreselect?: { club?: boolean; season?: boolean; type?: boolean; player?: boolean; badge?: boolean };
    catalogMiss?: boolean;
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
      seasonLabel: seasonLabel ?? undefined,
      playerLabel: playerLabel ?? undefined,
      patchLabel: patchLabel ?? undefined,
    };

    const hasSuggestions = Boolean(
      suggestions.clubId ||
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
      suggestions: hasSuggestions ? suggestions : undefined,
    };
  }

  private async resolveEntityLabel(
    entityType: "club" | "player" | "patch",
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

  /** @deprecated Use resolveEntityLabel("club", …) */
  private async resolveClubLabel(clubId: string, locale: LabelLocale): Promise<string | null> {
    return this.resolveEntityLabel("club", clubId, locale);
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
    selectedClubId: string,
    selectedSeasonId: string,
    selectedKitType: KitType,
  ): Promise<void> {
    const job = await this.getJob(userId, jobId);
    if (!job) {
      return;
    }

    const resolved = resolveVisionSaveAction({
      status: job.status,
      suggestions: job.suggestions,
      selectedClubId,
      selectedSeasonId,
      selectedKitType: selectedKitType,
    });

    await this.logUserAction(userId, jobId, resolved.action, userJerseyId);
  }
}
