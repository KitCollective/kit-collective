import type { VisionSuggestions } from "@kit/api-contract";
import type { Db } from "@kit/db";
import { catalogLabel, club, season, visionLog } from "@kit/db";
import type { LabelLocale, VisionJobStatus, VisionUserAction } from "@kit/domain";
import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { DB } from "../db/db.module.js";
import type { VisionAdapter, VisionInferenceResult } from "./vision.adapter.js";
import { VISION_ADAPTER } from "./vision.adapter.js";

export const VISION_QUEUE_NAME = "vision";

export type VisionJobPayload = {
  jobId: string;
  userId: string;
  draftId?: string;
  photoBytes: Uint8Array;
};

@Injectable()
export class VisionService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(VISION_ADAPTER) private readonly adapter: VisionAdapter,
  ) {}

  async createJob(userId: string, _photoBytes: Uint8Array, draftId?: string): Promise<string> {
    const [row] = await this.db
      .insert(visionLog)
      .values({
        userId,
        draftId: draftId ?? null,
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
    let result: VisionInferenceResult | null = null;
    let status: VisionJobStatus = "noop";

    try {
      result = await this.adapter.infer(payload.photoBytes);
      if (result?.clubId || result?.seasonId || result?.catalogKitId || result?.type) {
        status = "ready";
      } else if (result) {
        status = "noop";
      } else {
        status = "noop";
      }
    } catch {
      status = "failed";
    }

    await this.db
      .update(visionLog)
      .set({
        status,
        suggestedClubId: result?.clubId ?? null,
        suggestedSeasonId: result?.seasonId ?? null,
        suggestedCatalogKitId: result?.catalogKitId ?? null,
        suggestedType: result?.type ?? null,
        visionRaw: result?.visionRaw ?? null,
        confidences: result?.confidences ?? null,
        latencyMs: result?.latencyMs ?? null,
        model: result?.model ?? null,
        updatedAt: new Date(),
      })
      .where(eq(visionLog.id, payload.jobId));
  }

  async getJob(
    userId: string,
    jobId: string,
    locale: LabelLocale = "da",
  ): Promise<{
    jobId: string;
    status: VisionJobStatus;
    suggestions?: VisionSuggestions;
  } | null> {
    const [row] = await this.db
      .select({
        id: visionLog.id,
        userId: visionLog.userId,
        status: visionLog.status,
        suggestedClubId: visionLog.suggestedClubId,
        suggestedSeasonId: visionLog.suggestedSeasonId,
        suggestedCatalogKitId: visionLog.suggestedCatalogKitId,
        suggestedType: visionLog.suggestedType,
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
      };
    }

    const clubLabel = row.suggestedClubId
      ? await this.resolveClubLabel(row.suggestedClubId, locale)
      : undefined;
    const seasonLabel = row.suggestedSeasonId
      ? await this.resolveSeasonLabel(row.suggestedSeasonId)
      : undefined;

    const suggestions: VisionSuggestions = {
      clubId: row.suggestedClubId ?? undefined,
      seasonId: row.suggestedSeasonId ?? undefined,
      catalogKitId: row.suggestedCatalogKitId ?? undefined,
      type: row.suggestedType ?? undefined,
      clubLabel: clubLabel ?? undefined,
      seasonLabel: seasonLabel ?? undefined,
    };

    return {
      jobId: row.id,
      status: row.status,
      suggestions,
    };
  }

  private async resolveClubLabel(clubId: string, locale: LabelLocale): Promise<string | null> {
    const rows = await this.db
      .select({ label: catalogLabel.text, locale: catalogLabel.locale, kind: catalogLabel.kind })
      .from(club)
      .leftJoin(
        catalogLabel,
        and(eq(catalogLabel.entityType, "club"), eq(catalogLabel.entityId, club.id)),
      )
      .where(eq(club.id, clubId));

    const clubLabels = rows.filter((row) => row.label);
    return (
      clubLabels.find((row) => row.locale === locale && row.kind === "label")?.label ??
      clubLabels.find((row) => row.locale === "mul" && row.kind === "label")?.label ??
      clubLabels.find((row) => row.locale === "en" && row.kind === "label")?.label ??
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

  /** Fire-and-forget enqueue from Collection Save after first photo is persisted. */
  enqueueFromSave(
    userId: string,
    photoBytes: Uint8Array,
    enqueue: (payload: VisionJobPayload) => void,
    draftId?: string,
  ): void {
    void this.createJob(userId, photoBytes, draftId).then((jobId) => {
      this.enqueueJob(
        {
          jobId,
          userId,
          draftId,
          photoBytes,
        },
        enqueue,
      );
    });
  }
}
