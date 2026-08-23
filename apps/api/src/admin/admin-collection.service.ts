import {
  type AdminCollectorJerseyDrill,
  type AdminCollectorJerseyList,
  type AdminCollectorList,
  type AdminCollectorQuery,
  type AdminCollectorUser,
  type AdminRoleUpdateRequest,
  adminCollectorJerseyDrillSchema,
  adminCollectorJerseyListSchema,
  adminCollectorListSchema,
  adminCollectorUserSchema,
  identityRoleErrorSchema,
  type IdentityRoleErrorCode,
} from "@kit/api-contract";
import type { Db } from "@kit/db";
import { catalogLabel, club, season, user, userJersey, userJerseyPhoto } from "@kit/db";
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, count, desc, eq, ilike, inArray } from "drizzle-orm";
import { OBJECT_STORE } from "../collection/collection.service.js";
import type { ObjectStoreAdapter } from "../collection/object-store.js";
import { DB } from "../db/db.module.js";

function throwRoleGuardError(code: IdentityRoleErrorCode, message: string): never {
  throw new HttpException(
    {
      statusCode: HttpStatus.CONFLICT,
      ...identityRoleErrorSchema.parse({ code, message }),
    },
    HttpStatus.CONFLICT,
  );
}

function monogramFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  const letters = local.replace(/[^a-zA-Z0-9]/g, "");
  if (letters.length === 0) {
    return "?";
  }
  if (letters.length === 1) {
    return letters.toUpperCase();
  }
  return letters.slice(0, 2).toUpperCase();
}

@Injectable()
export class AdminCollectionService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(OBJECT_STORE) private readonly objectStore: ObjectStoreAdapter,
  ) {}

  async listCollectors(query: AdminCollectorQuery): Promise<AdminCollectorList> {
    const searchPattern = query.q ? `%${query.q}%` : null;

    const userRows = await this.db
      .select({
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(searchPattern ? ilike(user.email, searchPattern) : undefined)
      .orderBy(desc(user.createdAt));

    const jerseyCountRows =
      userRows.length === 0
        ? []
        : await this.db
            .select({
              userId: userJersey.userId,
              jerseyCount: count(userJersey.id),
            })
            .from(userJersey)
            .where(
              inArray(
                userJersey.userId,
                userRows.map((row) => row.id),
              ),
            )
            .groupBy(userJersey.userId);

    const countsByUser = new Map(
      jerseyCountRows.map((row) => [row.userId, Number(row.jerseyCount)]),
    );

    return adminCollectorListSchema.parse({
      total: userRows.length,
      rows: userRows.map((row) => ({
        id: row.id,
        email: row.email,
        role: row.role,
        jerseyCount: countsByUser.get(row.id) ?? 0,
        createdAt: row.createdAt.toISOString(),
        monogram: monogramFromEmail(row.email),
      })),
    });
  }

  async getCollector(userId: string): Promise<AdminCollectorUser> {
    const [row] = await this.db
      .select({
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        jerseyCount: count(userJersey.id),
      })
      .from(user)
      .leftJoin(userJersey, eq(userJersey.userId, user.id))
      .where(eq(user.id, userId))
      .groupBy(user.id, user.email, user.role, user.createdAt)
      .limit(1);

    if (!row) {
      throw new NotFoundException("User not found");
    }

    return adminCollectorUserSchema.parse({
      id: row.id,
      email: row.email,
      role: row.role,
      jerseyCount: Number(row.jerseyCount),
      createdAt: row.createdAt.toISOString(),
      monogram: monogramFromEmail(row.email),
    });
  }

  async listCollectorJerseys(userId: string): Promise<AdminCollectorJerseyList> {
    await this.assertUserExists(userId);

    const rows = await this.db
      .select({
        id: userJersey.id,
        clubId: userJersey.clubId,
        seasonLabel: season.label,
        type: userJersey.type,
      })
      .from(userJersey)
      .innerJoin(season, eq(userJersey.seasonId, season.id))
      .where(eq(userJersey.userId, userId))
      .orderBy(desc(userJersey.createdAt));

    if (rows.length === 0) {
      return adminCollectorJerseyListSchema.parse({ total: 0, rows: [] });
    }

    const clubIds = [...new Set(rows.map((row) => row.clubId))];
    const clubLabels = await this.resolveClubLabels(clubIds);
    const photoPaths = await this.firstPhotoPathByJersey(
      rows.map((row) => row.id),
      userId,
    );

    return adminCollectorJerseyListSchema.parse({
      total: rows.length,
      rows: rows.map((row) => {
        const clubLabel = clubLabels.get(row.clubId);
        if (!clubLabel) {
          throw new NotFoundException(`Club label missing for jersey ${row.id}`);
        }
        return {
          id: row.id,
          clubLabel,
          seasonLabel: row.seasonLabel,
          type: row.type,
          photoPath: photoPaths.get(row.id),
        };
      }),
    });
  }

  async getCollectorJersey(userId: string, jerseyId: string): Promise<AdminCollectorJerseyDrill> {
    const [row] = await this.db
      .select({
        id: userJersey.id,
        clubId: userJersey.clubId,
        seasonLabel: season.label,
        type: userJersey.type,
        size: userJersey.size,
        condition: userJersey.condition,
      })
      .from(userJersey)
      .innerJoin(season, eq(userJersey.seasonId, season.id))
      .where(and(eq(userJersey.id, jerseyId), eq(userJersey.userId, userId)))
      .limit(1);

    if (!row) {
      throw new NotFoundException("Jersey not found");
    }

    const clubLabels = await this.resolveClubLabels([row.clubId]);
    const clubLabel = clubLabels.get(row.clubId);
    if (!clubLabel) {
      throw new NotFoundException(`Club label missing for jersey ${row.id}`);
    }

    const photoRows = await this.db
      .select({
        id: userJerseyPhoto.id,
        role: userJerseyPhoto.role,
      })
      .from(userJerseyPhoto)
      .where(eq(userJerseyPhoto.userJerseyId, jerseyId))
      .orderBy(asc(userJerseyPhoto.createdAt));

    return adminCollectorJerseyDrillSchema.parse({
      id: row.id,
      clubLabel,
      seasonLabel: row.seasonLabel,
      type: row.type,
      size: row.size,
      condition: row.condition,
      photos: photoRows.map((photo) => ({
        id: photo.id,
        role: photo.role,
        photoPath: `/admin/collectors/${userId}/jerseys/${jerseyId}/photos/${photo.id}`,
      })),
    });
  }

  async getCollectorPhotoBytes(
    userId: string,
    jerseyId: string,
    photoId: string,
  ): Promise<Uint8Array> {
    const [row] = await this.db
      .select({
        objectKey: userJerseyPhoto.objectKey,
        jerseyUserId: userJersey.userId,
        jerseyId: userJersey.id,
      })
      .from(userJerseyPhoto)
      .innerJoin(userJersey, eq(userJerseyPhoto.userJerseyId, userJersey.id))
      .where(
        and(
          eq(userJerseyPhoto.id, photoId),
          eq(userJersey.id, jerseyId),
          eq(userJersey.userId, userId),
        ),
      )
      .limit(1);

    if (!row || !row.objectKey.startsWith(`user/${userId}/`)) {
      throw new NotFoundException("Photo not found");
    }

    const bytes = await this.objectStore.getObject(row.objectKey);
    if (!bytes) {
      throw new NotFoundException("Photo bytes missing");
    }

    return bytes;
  }

  async takeDownJersey(userId: string, jerseyId: string): Promise<void> {
    const [jerseyRow] = await this.db
      .select({ id: userJersey.id })
      .from(userJersey)
      .where(and(eq(userJersey.id, jerseyId), eq(userJersey.userId, userId)))
      .limit(1);

    if (!jerseyRow) {
      throw new NotFoundException("Jersey not found");
    }

    const photoRows = await this.db
      .select({
        id: userJerseyPhoto.id,
        objectKey: userJerseyPhoto.objectKey,
      })
      .from(userJerseyPhoto)
      .where(eq(userJerseyPhoto.userJerseyId, jerseyId));

    for (const photo of photoRows) {
      if (!photo.objectKey.startsWith(`user/${userId}/${jerseyId}/`)) {
        throw new InternalServerErrorException("Invalid photo object key");
      }
      try {
        await this.objectStore.deleteObject(photo.objectKey);
      } catch {
        throw new InternalServerErrorException("Failed to delete photo bytes");
      }
    }

    await this.db.delete(userJerseyPhoto).where(eq(userJerseyPhoto.userJerseyId, jerseyId));
    await this.db
      .delete(userJersey)
      .where(and(eq(userJersey.id, jerseyId), eq(userJersey.userId, userId)));
  }

  async updateUserRole(
    actorUserId: string,
    targetUserId: string,
    body: AdminRoleUpdateRequest,
  ): Promise<AdminCollectorUser> {
    const [target] = await this.db
      .select({
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(eq(user.id, targetUserId))
      .limit(1);

    if (!target) {
      throw new NotFoundException("User not found");
    }

    if (target.id === actorUserId && body.role === "user" && target.role === "admin") {
      throwRoleGuardError("SELF_DEMOTE", "You cannot demote your own Staff access.");
    }

    if (target.role === "admin" && body.role === "user") {
      const [adminCount] = await this.db
        .select({ total: count(user.id) })
        .from(user)
        .where(eq(user.role, "admin"));

      if (Number(adminCount?.total ?? 0) <= 1) {
        throwRoleGuardError("LAST_ADMIN_DEMOTE", "At least one Staff access account must remain.");
      }
    }

    const [updated] = await this.db
      .update(user)
      .set({ role: body.role })
      .where(eq(user.id, targetUserId))
      .returning({
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      });

    if (!updated) {
      throw new NotFoundException("User not found");
    }

    const [jerseyCountRow] = await this.db
      .select({ total: count(userJersey.id) })
      .from(userJersey)
      .where(eq(userJersey.userId, targetUserId));

    return adminCollectorUserSchema.parse({
      id: updated.id,
      email: updated.email,
      role: updated.role,
      jerseyCount: Number(jerseyCountRow?.total ?? 0),
      createdAt: updated.createdAt.toISOString(),
      monogram: monogramFromEmail(updated.email),
    });
  }

  private async assertUserExists(userId: string): Promise<void> {
    const [found] = await this.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    if (!found) {
      throw new NotFoundException("User not found");
    }
  }

  private async resolveClubLabels(clubIds: string[]): Promise<Map<string, string>> {
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
        clubLabels.find((row) => row.locale === "en" && row.kind === "label")?.label ??
        clubLabels.find((row) => row.locale === "mul" && row.kind === "label")?.label ??
        clubLabels.find((row) => row.locale === "da" && row.kind === "label")?.label;

      if (resolved) {
        labels.set(clubId, resolved);
      }
    }

    return labels;
  }

  private async firstPhotoPathByJersey(
    jerseyIds: string[],
    userId: string,
  ): Promise<Map<string, string>> {
    const paths = new Map<string, string>();
    if (jerseyIds.length === 0) {
      return paths;
    }

    const photoRows = await this.db
      .select({
        id: userJerseyPhoto.id,
        userJerseyId: userJerseyPhoto.userJerseyId,
      })
      .from(userJerseyPhoto)
      .where(inArray(userJerseyPhoto.userJerseyId, jerseyIds))
      .orderBy(asc(userJerseyPhoto.createdAt));

    for (const row of photoRows) {
      if (!paths.has(row.userJerseyId)) {
        paths.set(
          row.userJerseyId,
          `/admin/collectors/${userId}/jerseys/${row.userJerseyId}/photos/${row.id}`,
        );
      }
    }

    return paths;
  }
}
