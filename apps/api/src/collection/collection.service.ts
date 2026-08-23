import {
  type CollectionJersey,
  type CollectionJerseys,
  type CollectionSavePhoto,
  type CollectionSaveResponse,
  collectionJerseysSchema,
  collectionSaveRequestSchema,
  collectionSaveResponseSchema,
} from "@kit/api-contract";
import type { Db } from "@kit/db";
import {
  catalogLabel,
  club,
  jerseyDraft,
  season,
  teamSeason,
  userJersey,
  userJerseyPhoto,
} from "@kit/db";
import type { LabelLocale } from "@kit/domain";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { DB } from "../db/db.module.js";
import { VisionService } from "../vision/vision.service.js";
import { VisionQueueService } from "../vision/vision-queue.service.js";
import { CollectionShortcutsService } from "./collection-shortcuts.service.js";
import { createMemoryObjectStore, type ObjectStoreAdapter } from "./object-store.js";
import { createR2ObjectStore } from "./r2-object-store.js";

export const OBJECT_STORE = Symbol("OBJECT_STORE");

function hasR2Config(): boolean {
  return Boolean(
    process.env.R2_ENDPOINT &&
      process.env.R2_BUCKET &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY,
  );
}

function decodeBase64Photo(contentBase64: string): Uint8Array {
  const commaIndex = contentBase64.indexOf(",");
  const normalized = commaIndex >= 0 ? contentBase64.slice(commaIndex + 1) : contentBase64;
  const bytes = Buffer.from(normalized, "base64");
  if (bytes.length === 0) {
    throw new BadRequestException("Photo bytes are empty");
  }
  return Uint8Array.from(bytes);
}

@Injectable()
export class CollectionService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(OBJECT_STORE) private readonly objectStore: ObjectStoreAdapter,
    private readonly visionQueueService: VisionQueueService,
    private readonly visionService: VisionService,
    private readonly shortcutsService: CollectionShortcutsService,
  ) {}

  static objectStoreFactory(): ObjectStoreAdapter {
    if (hasR2Config()) {
      return createR2ObjectStore();
    }
    return createMemoryObjectStore();
  }

  async listJerseys(
    userId: string,
    locale: LabelLocale = "da",
    shortcutId?: string,
  ): Promise<CollectionJerseys> {
    let filterConditions = [eq(userJersey.userId, userId)];

    if (shortcutId) {
      const facets = await this.shortcutsService.getShortcutFacetsForFilter(userId, shortcutId);
      filterConditions = this.shortcutsService.buildJerseyFilterConditions(userId, facets);
    }

    const rows = await this.db
      .select({
        id: userJersey.id,
        clubId: userJersey.clubId,
        seasonId: userJersey.seasonId,
        catalogKitId: userJersey.catalogKitId,
        type: userJersey.type,
        size: userJersey.size,
        condition: userJersey.condition,
        seasonLabel: season.label,
      })
      .from(userJersey)
      .innerJoin(season, eq(userJersey.seasonId, season.id))
      .innerJoin(club, eq(userJersey.clubId, club.id))
      .where(and(...filterConditions))
      .orderBy(desc(userJersey.createdAt));

    if (rows.length === 0) {
      return collectionJerseysSchema.parse({ jerseys: [] });
    }

    const clubIds = [...new Set(rows.map((row) => row.clubId))];
    const jerseyIds = rows.map((row) => row.id);
    const clubLabels = await this.resolveClubLabels(clubIds, locale);
    const photosByJersey = await this.loadPhotosForJerseys(jerseyIds);

    const jerseys: CollectionJersey[] = rows.map((row) => {
      const clubLabel = clubLabels.get(row.clubId);
      if (!clubLabel) {
        throw new NotFoundException(`Club label missing for jersey ${row.id}`);
      }

      const photos = photosByJersey.get(row.id);
      if (!photos || photos.length === 0) {
        throw new NotFoundException(`Photos missing for jersey ${row.id}`);
      }

      return {
        id: row.id,
        clubId: row.clubId,
        seasonId: row.seasonId,
        catalogKitId: row.catalogKitId,
        type: row.type,
        size: row.size,
        condition: row.condition,
        clubLabel,
        seasonLabel: row.seasonLabel,
        photos,
      };
    });

    return collectionJerseysSchema.parse({ jerseys });
  }

  async saveJersey(
    userId: string,
    rawBody: unknown,
    locale: LabelLocale = "da",
  ): Promise<CollectionSaveResponse> {
    const body = collectionSaveRequestSchema.parse(rawBody);

    if (body.draftId) {
      const existing = await this.findJerseyByDraft(userId, body.draftId);
      if (existing) {
        return collectionSaveResponseSchema.parse({ jersey: existing });
      }
    }

    const [clubRow] = await this.db
      .select({ id: club.id })
      .from(club)
      .where(eq(club.id, body.clubId))
      .limit(1);

    if (!clubRow) {
      throw new BadRequestException("clubId is not a catalog club");
    }

    const [seasonRow] = await this.db
      .select({ id: season.id, label: season.label })
      .from(season)
      .where(eq(season.id, body.seasonId))
      .limit(1);

    if (!seasonRow) {
      throw new BadRequestException("seasonId is not a catalog season");
    }

    const [teamSeasonRow] = await this.db
      .select({ id: teamSeason.id })
      .from(teamSeason)
      .where(and(eq(teamSeason.clubId, body.clubId), eq(teamSeason.seasonId, body.seasonId)))
      .limit(1);

    if (!teamSeasonRow) {
      throw new BadRequestException("clubId and seasonId are not linked in TeamSeason");
    }

    const clubLabels = await this.resolveClubLabels([body.clubId], locale);
    const clubLabel = clubLabels.get(body.clubId);
    if (!clubLabel) {
      throw new BadRequestException("clubId has no resolved label");
    }

    const [insertedJersey] = await this.db
      .insert(userJersey)
      .values({
        userId,
        clubId: body.clubId,
        seasonId: body.seasonId,
        catalogKitId: body.catalogKitId ?? null,
        type: body.type,
        size: body.size,
        condition: body.condition,
        draftId: body.draftId ?? null,
      })
      .returning({
        id: userJersey.id,
        clubId: userJersey.clubId,
        seasonId: userJersey.seasonId,
        catalogKitId: userJersey.catalogKitId,
        type: userJersey.type,
        size: userJersey.size,
        condition: userJersey.condition,
      });

    if (!insertedJersey) {
      throw new BadRequestException("Could not create UserJersey");
    }

    const photos = await this.persistPhotos(userId, insertedJersey.id, body.photos);

    const firstPhoto = body.photos[0];
    let effectiveVisionJobId = body.visionJobId ?? null;
    const shouldEnqueueVision =
      firstPhoto &&
      !effectiveVisionJobId &&
      !(body.draftId && (await this.visionService.findActiveJobForDraft(userId, body.draftId)));

    if (shouldEnqueueVision) {
      const firstPhotoBytes = decodeBase64Photo(firstPhoto.contentBase64);
      effectiveVisionJobId = await this.visionQueueService.enqueueFromSave(
        userId,
        firstPhotoBytes,
        body.draftId,
      );
    }

    if (effectiveVisionJobId) {
      await this.visionService.reconcileUserActionAtSave(
        userId,
        effectiveVisionJobId,
        insertedJersey.id,
        body.clubId,
        body.seasonId,
        body.type,
      );
    }

    if (body.draftId) {
      await this.db
        .insert(jerseyDraft)
        .values({
          id: body.draftId,
          userId,
          userJerseyId: insertedJersey.id,
        })
        .onConflictDoUpdate({
          target: jerseyDraft.id,
          set: {
            userJerseyId: insertedJersey.id,
            updatedAt: new Date(),
          },
        });
    }

    const jersey: CollectionJersey = {
      id: insertedJersey.id,
      clubId: insertedJersey.clubId,
      seasonId: insertedJersey.seasonId,
      catalogKitId: insertedJersey.catalogKitId,
      type: insertedJersey.type,
      size: insertedJersey.size,
      condition: insertedJersey.condition,
      clubLabel,
      seasonLabel: seasonRow.label,
      photos,
    };

    return collectionSaveResponseSchema.parse({
      jersey,
      visionJobId: effectiveVisionJobId ?? undefined,
    });
  }

  async getPhotoBytes(userId: string, photoId: string): Promise<Uint8Array> {
    const [row] = await this.db
      .select({
        objectKey: userJerseyPhoto.objectKey,
        jerseyUserId: userJersey.userId,
      })
      .from(userJerseyPhoto)
      .innerJoin(userJersey, eq(userJerseyPhoto.userJerseyId, userJersey.id))
      .where(eq(userJerseyPhoto.id, photoId))
      .limit(1);

    if (!row || row.jerseyUserId !== userId) {
      throw new NotFoundException("Photo not found");
    }

    if (!row.objectKey.startsWith(`user/${userId}/`)) {
      throw new NotFoundException("Photo not found");
    }

    const bytes = await this.objectStore.getObject(row.objectKey);
    if (!bytes) {
      throw new NotFoundException("Photo bytes missing");
    }

    return bytes;
  }

  private async findJerseyByDraft(
    userId: string,
    draftId: string,
  ): Promise<CollectionJersey | null> {
    const [draft] = await this.db
      .select({
        userJerseyId: jerseyDraft.userJerseyId,
      })
      .from(jerseyDraft)
      .where(and(eq(jerseyDraft.id, draftId), eq(jerseyDraft.userId, userId)))
      .limit(1);

    if (!draft?.userJerseyId) {
      return null;
    }

    const jerseys = await this.listJerseys(userId);
    return (
      jerseys.jerseys.find((jersey: CollectionJersey) => jersey.id === draft.userJerseyId) ?? null
    );
  }

  private async resolveClubLabels(
    clubIds: string[],
    locale: LabelLocale,
  ): Promise<Map<string, string>> {
    if (clubIds.length === 0) {
      return new Map();
    }

    const rows = await this.db
      .select({
        clubId: club.id,
        label: catalogLabel.text,
        locale: catalogLabel.locale,
        kind: catalogLabel.kind,
      })
      .from(club)
      .leftJoin(
        catalogLabel,
        and(eq(catalogLabel.entityType, "club"), eq(catalogLabel.entityId, club.id)),
      )
      .where(inArray(club.id, clubIds));

    const labels = new Map<string, string>();

    for (const clubId of clubIds) {
      const clubLabels = rows.filter((row) => row.clubId === clubId && row.label);
      const resolved =
        clubLabels.find((row) => row.locale === locale && row.kind === "label")?.label ??
        clubLabels.find((row) => row.locale === "mul" && row.kind === "label")?.label ??
        clubLabels.find((row) => row.locale === "en" && row.kind === "label")?.label;

      if (resolved) {
        labels.set(clubId, resolved);
      }
    }

    return labels;
  }

  private async loadPhotosForJerseys(jerseyIds: string[]) {
    const photosByJersey = new Map<string, CollectionJersey["photos"]>();

    if (jerseyIds.length === 0) {
      return photosByJersey;
    }

    const photoRows = await this.db
      .select({
        id: userJerseyPhoto.id,
        userJerseyId: userJerseyPhoto.userJerseyId,
        objectKey: userJerseyPhoto.objectKey,
        role: userJerseyPhoto.role,
        source: userJerseyPhoto.source,
        ocrStatus: userJerseyPhoto.ocrStatus,
      })
      .from(userJerseyPhoto)
      .where(inArray(userJerseyPhoto.userJerseyId, jerseyIds))
      .orderBy(asc(userJerseyPhoto.createdAt));

    for (const row of photoRows) {
      if (!row.objectKey.startsWith("user/")) {
        continue;
      }

      const photo = {
        id: row.id,
        role: row.role,
        source: row.source,
        objectKey: row.objectKey,
        photoUrl: `/v1/collection/photos/${row.id}`,
        ocrStatus: row.ocrStatus,
      };

      const existing = photosByJersey.get(row.userJerseyId) ?? [];
      existing.push(photo);
      photosByJersey.set(row.userJerseyId, existing);
    }

    return photosByJersey;
  }

  private async persistPhotos(
    userId: string,
    jerseyId: string,
    photos: CollectionSavePhoto[],
  ): Promise<CollectionJersey["photos"]> {
    const saved: CollectionJersey["photos"] = [];

    for (const photo of photos) {
      const bytes = decodeBase64Photo(photo.contentBase64);
      const photoId = crypto.randomUUID();
      const objectKey = `user/${userId}/${jerseyId}/${photoId}.jpg`;

      await this.objectStore.putObject(objectKey, bytes);

      const exists = await this.objectStore.objectExists(objectKey);
      if (!exists) {
        throw new BadRequestException(`Object store missing key after put: ${objectKey}`);
      }

      const [inserted] = await this.db
        .insert(userJerseyPhoto)
        .values({
          id: photoId,
          userJerseyId: jerseyId,
          objectKey,
          role: photo.role,
          source: photo.source,
          ocrStatus: "none",
        })
        .returning({
          id: userJerseyPhoto.id,
          role: userJerseyPhoto.role,
          source: userJerseyPhoto.source,
          objectKey: userJerseyPhoto.objectKey,
          ocrStatus: userJerseyPhoto.ocrStatus,
        });

      if (!inserted) {
        throw new BadRequestException("Could not persist photo row");
      }

      saved.push({
        id: inserted.id,
        role: inserted.role,
        source: inserted.source,
        objectKey: inserted.objectKey,
        photoUrl: `/v1/collection/photos/${inserted.id}`,
        ocrStatus: inserted.ocrStatus,
      });
    }

    return saved;
  }
}
