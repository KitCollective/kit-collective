import {
  type HandleAvailabilityResponse,
  handleAvailabilityResponseSchema,
  handleSchema,
  type IdentityAvatarUpload,
  type IdentityMe,
  type IdentityProfileUpdate,
  type IdentityRole,
  type IdentitySession,
  identityAvatarUploadSchema,
  identityCredentialsSchema,
  identityMeSchema,
  identityProfileUpdateSchema,
  identitySessionSchema,
} from "@kit/api-contract";
import { user } from "@kit/db";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { createMemoryObjectStore, type ObjectStoreAdapter } from "../collection/object-store.js";
import { createR2ObjectStore } from "../collection/r2-object-store.js";
import { DB, type DbToken } from "../db/db.module.js";
import {
  avatarObjectKeyForUser,
  avatarUrlForUser,
  baseHandleFromEmail,
  isHandleEmail,
  nextHandleCandidate,
} from "./identity.helpers.js";

const { hash, compare } = bcrypt;

export type JwtPayload = {
  sub: string;
  email: string;
  role: IdentityRole;
};

function hasR2Config(): boolean {
  return Boolean(
    process.env.R2_ENDPOINT &&
      process.env.R2_BUCKET &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY,
  );
}

@Injectable()
export class IdentityService {
  private readonly objectStore: ObjectStoreAdapter;

  constructor(
    @Inject(DB) private readonly db: DbToken,
    private readonly jwtService: JwtService,
  ) {
    this.objectStore = hasR2Config() ? createR2ObjectStore() : createMemoryObjectStore();
  }

  async register(rawBody: unknown): Promise<IdentitySession> {
    const credentials = identityCredentialsSchema.parse(rawBody);
    const normalizedEmail = credentials.email.toLowerCase();

    const [existing] = await this.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, normalizedEmail))
      .limit(1);

    if (existing) {
      throw new ConflictException("Email already registered");
    }

    const passwordHash = await hash(credentials.password, 12);
    const assignedHandle = await this.assignUniqueHandle(normalizedEmail);

    const [created] = await this.db
      .insert(user)
      .values({
        email: normalizedEmail,
        passwordHash,
        handle: assignedHandle,
      })
      .returning({
        id: user.id,
        email: user.email,
        role: user.role,
        handle: user.handle,
      });

    if (!created) {
      throw new ConflictException("Email already registered");
    }

    return this.buildSession(created);
  }

  async login(rawBody: unknown): Promise<IdentitySession> {
    const credentials = identityCredentialsSchema.parse(rawBody);
    const [found] = await this.db
      .select({
        id: user.id,
        email: user.email,
        role: user.role,
        handle: user.handle,
        passwordHash: user.passwordHash,
      })
      .from(user)
      .where(eq(user.email, credentials.email.toLowerCase()))
      .limit(1);

    if (!found) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const valid = await compare(credentials.password, found.passwordHash);
    if (!valid) {
      throw new UnauthorizedException("Invalid email or password");
    }

    return this.buildSession({
      id: found.id,
      email: found.email,
      role: found.role,
      handle: found.handle,
    });
  }

  async getMe(userId: string): Promise<IdentityMe> {
    const [found] = await this.db
      .select({
        id: user.id,
        email: user.email,
        role: user.role,
        handle: user.handle,
        aboutMe: user.aboutMe,
        avatarObjectKey: user.avatarObjectKey,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!found) {
      throw new UnauthorizedException();
    }

    return identityMeSchema.parse({
      id: found.id,
      email: found.email,
      role: found.role,
      handle: found.handle,
      aboutMe: found.aboutMe,
      avatarUrl: found.avatarObjectKey ? avatarUrlForUser() : null,
    });
  }

  async getHandleAvailability(
    userId: string,
    rawQuery: unknown,
  ): Promise<HandleAvailabilityResponse> {
    const handle = this.parseHandleQuery(rawQuery);
    const status = await this.resolveHandleStatus(userId, handle);
    return handleAvailabilityResponseSchema.parse({ handle, status });
  }

  async updateProfile(userId: string, rawBody: unknown): Promise<IdentityMe> {
    const body: IdentityProfileUpdate = identityProfileUpdateSchema.parse(rawBody);

    const [current] = await this.db
      .select({
        email: user.email,
        handle: user.handle,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!current) {
      throw new UnauthorizedException();
    }

    if (body.handle !== undefined) {
      if (isHandleEmail(body.handle, current.email)) {
        throw new BadRequestException("Handle cannot be your email");
      }

      const status = await this.resolveHandleStatus(userId, body.handle);
      if (status === "taken") {
        throw new ConflictException("Handle is taken");
      }
    }

    const [updated] = await this.db
      .update(user)
      .set({
        ...(body.handle !== undefined ? { handle: body.handle } : {}),
        ...(body.aboutMe !== undefined ? { aboutMe: body.aboutMe } : {}),
      })
      .where(eq(user.id, userId))
      .returning({
        id: user.id,
        email: user.email,
        role: user.role,
        handle: user.handle,
        aboutMe: user.aboutMe,
        avatarObjectKey: user.avatarObjectKey,
      });

    if (!updated) {
      throw new UnauthorizedException();
    }

    return identityMeSchema.parse({
      id: updated.id,
      email: updated.email,
      role: updated.role,
      handle: updated.handle,
      aboutMe: updated.aboutMe,
      avatarUrl: updated.avatarObjectKey ? avatarUrlForUser() : null,
    });
  }

  async uploadAvatar(userId: string, rawBody: unknown): Promise<IdentityMe> {
    const body: IdentityAvatarUpload = identityAvatarUploadSchema.parse(rawBody);
    const bytes = Buffer.from(body.contentBase64, "base64");
    if (bytes.length === 0) {
      throw new BadRequestException("Avatar content is empty");
    }

    const objectKey = avatarObjectKeyForUser(userId);
    await this.objectStore.putObject(objectKey, Uint8Array.from(bytes));

    const exists = await this.objectStore.objectExists(objectKey);
    if (!exists) {
      throw new BadRequestException(`Object store missing key after put: ${objectKey}`);
    }

    const [updated] = await this.db
      .update(user)
      .set({ avatarObjectKey: objectKey })
      .where(eq(user.id, userId))
      .returning({
        id: user.id,
        email: user.email,
        role: user.role,
        handle: user.handle,
        aboutMe: user.aboutMe,
        avatarObjectKey: user.avatarObjectKey,
      });

    if (!updated) {
      throw new UnauthorizedException();
    }

    return identityMeSchema.parse({
      id: updated.id,
      email: updated.email,
      role: updated.role,
      handle: updated.handle,
      aboutMe: updated.aboutMe,
      avatarUrl: avatarUrlForUser(),
    });
  }

  async getAvatarBytes(userId: string): Promise<Uint8Array> {
    const [found] = await this.db
      .select({
        avatarObjectKey: user.avatarObjectKey,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!found?.avatarObjectKey) {
      throw new NotFoundException("Avatar not found");
    }

    if (!found.avatarObjectKey.startsWith(`user/${userId}/`)) {
      throw new NotFoundException("Avatar not found");
    }

    if (found.avatarObjectKey.includes("/kit/")) {
      throw new NotFoundException("Avatar not found");
    }

    const bytes = await this.objectStore.getObject(found.avatarObjectKey);
    if (!bytes) {
      throw new NotFoundException("Avatar bytes missing");
    }

    return bytes;
  }

  private parseHandleQuery(rawQuery: unknown): string {
    if (typeof rawQuery !== "object" || rawQuery === null || !("handle" in rawQuery)) {
      throw new BadRequestException("handle query parameter is required");
    }

    const handleValue = (rawQuery as { handle: unknown }).handle;
    if (typeof handleValue !== "string") {
      throw new BadRequestException("handle query parameter is required");
    }

    return handleSchema.parse(handleValue);
  }

  private async resolveHandleStatus(
    userId: string,
    handle: string,
  ): Promise<HandleAvailabilityResponse["status"]> {
    const [current] = await this.db
      .select({ handle: user.handle, email: user.email })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!current) {
      throw new UnauthorizedException();
    }

    if (handle === current.handle) {
      return "yours";
    }

    if (isHandleEmail(handle, current.email)) {
      return "taken";
    }

    const [existing] = await this.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.handle, handle))
      .limit(1);

    return existing ? "taken" : "available";
  }

  private async assignUniqueHandle(email: string): Promise<string> {
    const base = baseHandleFromEmail(email);

    for (let attempt = 0; attempt < 100; attempt += 1) {
      const candidate = nextHandleCandidate(base, attempt);
      const [existing] = await this.db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.handle, candidate))
        .limit(1);

      if (!existing && !isHandleEmail(candidate, email)) {
        return candidate;
      }
    }

    throw new ConflictException("Could not assign a unique handle");
  }

  private buildSession(row: {
    id: string;
    email: string;
    role: IdentityRole;
    handle: string;
  }): IdentitySession {
    const payload: JwtPayload = {
      sub: row.id,
      email: row.email,
      role: row.role,
    };

    return identitySessionSchema.parse({
      accessToken: this.jwtService.sign(payload),
      user: {
        id: row.id,
        email: row.email,
        role: row.role,
        handle: row.handle,
      },
    });
  }
}
