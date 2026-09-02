import { createHash, randomBytes } from "node:crypto";
import {
  type AuthEvents,
  type AuthSecurityDetections,
  authEventsSchema,
  authSecurityDetectionsSchema,
  type CookieConsent,
  type CookieConsentUpdate,
  cookieConsentSchema,
  cookieConsentUpdateSchema,
  type HandleAvailabilityResponse,
  handleAvailabilityResponseSchema,
  handleSchema,
  IDENTITY_LINKED_PROVIDERS,
  type IdentityAccountUpdate,
  type IdentityAvatarUpload,
  type IdentityEmailChange,
  type IdentityExport,
  type IdentityLinkedAccount,
  type IdentityLinkedProvider,
  type IdentityMe,
  type IdentityPasswordChange,
  type IdentityPasswordResetAccepted,
  type IdentityPeerProfile,
  type IdentityPrefs,
  type IdentityPrefsUpdate,
  type IdentityProfileUpdate,
  type IdentityRole,
  type IdentitySession,
  type IdentityVerifyResponse,
  identityAccountUpdateSchema,
  identityAvatarUploadSchema,
  identityCredentialsSchema,
  identityEmailChangeSchema,
  identityExportSchema,
  identityMeSchema,
  identityPasswordChangeSchema,
  identityPasswordResetAcceptedSchema,
  identityPasswordResetCompleteSchema,
  identityPasswordResetRequestSchema,
  identityPeerProfileSchema,
  identityPrefsSchema,
  identityPrefsUpdateSchema,
  identityProfileUpdateSchema,
  identitySessionSchema,
  identitySocialLoginSchema,
  identityVerifyRequestSchema,
  identityVerifyResponseSchema,
} from "@kit/api-contract";
import {
  account,
  authEvent,
  authSecurityDetection,
  catalogLabel,
  collectionShortcut,
  conversation,
  conversationMessage,
  conversationParticipant,
  country,
  identityProvider,
  jerseyDraft,
  session,
  user,
  userJersey,
  userJerseyFavorite,
  userJerseyPhoto,
  verification,
  visionLog,
} from "@kit/db";
import type { AuthEventKind } from "@kit/domain";
import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import bcrypt from "bcryptjs";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { BillingService } from "../billing/billing.service.js";
import { createMemoryObjectStore, type ObjectStoreAdapter } from "../collection/object-store.js";
import { createR2ObjectStore } from "../collection/r2-object-store.js";
import { requireBetterAuthUrl } from "../config/better-auth-env.js";
import { DB, type DbToken } from "../db/db.module.js";
import { ModerationService } from "../moderation/moderation.service.js";
import { NotifyService } from "../notify/notify.service.js";
import { AUTH, type AuthInstance } from "./auth.js";
import type { IdTokenVerifierAdapter, VerifiedIdToken } from "./id-token.adapter.js";
import { ID_TOKEN_VERIFIER } from "./id-token.token.js";
import {
  avatarObjectKeyForUser,
  avatarUrlForPeer,
  avatarUrlForUser,
  baseHandleFromEmail,
  isHandleEmail,
  nextHandleCandidate,
} from "./identity.helpers.js";
import { bearerTokenFromAuthorization } from "./request-headers.js";
import type { SentinelAdapter } from "./sentinel.adapter.js";
import { SENTINEL } from "./sentinel.token.js";

const { hash, compare } = bcrypt;

const USER_ME_SELECT = {
  id: user.id,
  email: user.email,
  role: user.role,
  handle: user.handle,
  aboutMe: user.aboutMe,
  avatarObjectKey: user.avatarObjectKey,
  fullName: user.fullName,
  phone: user.phone,
  birthday: user.birthday,
  emailVerified: user.emailVerified,
  countryId: user.countryId,
  city: user.city,
  showCity: user.showCity,
} as const;

const USER_PREFS_SELECT = {
  pushEnabled: user.pushEnabled,
  pushHighPriority: user.pushHighPriority,
  pushOther: user.pushOther,
  emailNews: user.emailNews,
  emailHighPriority: user.emailHighPriority,
  privacyPersonalised: user.privacyPersonalised,
  privacyRecentlySeen: user.privacyRecentlySeen,
  privacyFavoriteNotifications: user.privacyFavoriteNotifications,
  locale: user.locale,
  appearance: user.appearance,
} as const;

const USER_COOKIE_SELECT = {
  cookieAnalysis: user.cookieAnalysis,
  cookieMarketing: user.cookieMarketing,
} as const;

export type JwtPayload = {
  sub: string;
  email: string;
  role: IdentityRole;
};

function formatBirthday(birthday: string | Date | null): string | null {
  if (birthday instanceof Date) {
    return birthday.toISOString().slice(0, 10);
  }
  return birthday;
}

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
    @Inject(AUTH) private readonly auth: AuthInstance,
    @Inject(forwardRef(() => BillingService))
    private readonly billingService: BillingService,
    private readonly moderationService: ModerationService,
    private readonly notifyService: NotifyService,
    @Inject(ID_TOKEN_VERIFIER) private readonly idTokenVerifier: IdTokenVerifierAdapter,
    @Inject(SENTINEL) private readonly sentinel: SentinelAdapter,
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
        name: assignedHandle,
        handle: assignedHandle,
        emailVerified: false,
      })
      .returning(USER_ME_SELECT);

    if (!created) {
      throw new ConflictException("Email already registered");
    }

    const accessToken = await this.createSessionToken(created.id);
    await this.sendAuthMail(created.id, created.email, "verify");
    return await this.buildSession(created, accessToken);
  }

  async login(rawBody: unknown): Promise<IdentitySession> {
    const credentials = identityCredentialsSchema.parse(rawBody);
    const [found] = await this.db
      .select({
        ...USER_ME_SELECT,
        passwordHash: user.passwordHash,
      })
      .from(user)
      .where(eq(user.email, credentials.email.toLowerCase()))
      .limit(1);

    if (!found) {
      await this.recordAuthEvent({ kind: "failure", userId: null });
      throw new UnauthorizedException("Invalid email or password");
    }

    const valid = await compare(credentials.password, found.passwordHash);
    if (!valid) {
      await this.recordAuthEvent({ kind: "failure", userId: found.id });
      throw new UnauthorizedException("Invalid email or password");
    }

    const { passwordHash: _passwordHash, ...sessionRow } = found;
    const accessToken = await this.createSessionToken(found.id);
    await this.recordAuthEvent({ kind: "login", userId: found.id });
    return await this.buildSession(sessionRow, accessToken);
  }

  async socialLogin(rawBody: unknown): Promise<IdentitySession> {
    const parsed = identitySocialLoginSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException("Invalid social login");
    }
    const body = parsed.data;

    let claims: VerifiedIdToken;
    try {
      claims = await this.idTokenVerifier.verify(body.provider, body.idToken);
    } catch {
      await this.recordAuthEvent({ kind: "failure", userId: null, provider: body.provider });
      throw new UnauthorizedException("Invalid social login");
    }

    if (!claims.emailVerified) {
      await this.recordAuthEvent({ kind: "failure", userId: null, provider: body.provider });
      throw new UnauthorizedException("Unverified social email");
    }

    const normalizedEmail = claims.email.toLowerCase();

    const [existingLink] = await this.db
      .select({ userId: identityProvider.userId })
      .from(identityProvider)
      .where(
        and(
          eq(identityProvider.provider, body.provider),
          eq(identityProvider.providerUserId, claims.providerUserId),
        ),
      )
      .limit(1);

    if (existingLink) {
      const [linkedUser] = await this.db
        .select(USER_ME_SELECT)
        .from(user)
        .where(eq(user.id, existingLink.userId))
        .limit(1);
      if (!linkedUser) {
        throw new UnauthorizedException("Invalid social login");
      }
      await this.persistProviderLink({
        userId: linkedUser.id,
        provider: body.provider,
        providerUserId: claims.providerUserId,
      });
      const accessToken = await this.createSessionToken(linkedUser.id);
      await this.recordAuthEvent({
        kind: "login",
        userId: linkedUser.id,
        provider: body.provider,
      });
      return await this.buildSession(linkedUser, accessToken);
    }

    const [existingUser] = await this.db
      .select(USER_ME_SELECT)
      .from(user)
      .where(eq(user.email, normalizedEmail))
      .limit(1);

    if (existingUser) {
      const [updated] = await this.db
        .update(user)
        .set({ emailVerified: true })
        .where(eq(user.id, existingUser.id))
        .returning(USER_ME_SELECT);
      if (!updated) {
        throw new UnauthorizedException("Invalid social login");
      }
      await this.persistProviderLink({
        userId: updated.id,
        provider: body.provider,
        providerUserId: claims.providerUserId,
      });
      const accessToken = await this.createSessionToken(updated.id);
      await this.recordAuthEvent({
        kind: "login",
        userId: updated.id,
        provider: body.provider,
      });
      return await this.buildSession(updated, accessToken);
    }

    const passwordHash = await hash(randomBytes(32).toString("hex"), 12);
    const assignedHandle = await this.assignUniqueHandle(normalizedEmail);
    const [created] = await this.db
      .insert(user)
      .values({
        email: normalizedEmail,
        passwordHash,
        name: assignedHandle,
        handle: assignedHandle,
        emailVerified: true,
      })
      .returning(USER_ME_SELECT);

    if (!created) {
      throw new ConflictException("Email already registered");
    }

    await this.persistProviderLink({
      userId: created.id,
      provider: body.provider,
      providerUserId: claims.providerUserId,
    });
    const accessToken = await this.createSessionToken(created.id);
    await this.recordAuthEvent({
      kind: "login",
      userId: created.id,
      provider: body.provider,
    });
    return await this.buildSession(created, accessToken);
  }

  async verifyEmail(rawBody: unknown): Promise<IdentityVerifyResponse> {
    const { token } = identityVerifyRequestSchema.parse(rawBody);
    const userId = await this.consumeAuthToken(token, "verify");
    await this.db.update(user).set({ emailVerified: true }).where(eq(user.id, userId));
    return identityVerifyResponseSchema.parse({ emailVerified: true });
  }

  async requestPasswordReset(rawBody: unknown): Promise<IdentityPasswordResetAccepted> {
    const { email } = identityPasswordResetRequestSchema.parse(rawBody);
    const normalizedEmail = email.toLowerCase();
    const [found] = await this.db
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(eq(user.email, normalizedEmail))
      .limit(1);

    if (found) {
      await this.sendAuthMail(found.id, found.email, "reset");
    }

    return identityPasswordResetAcceptedSchema.parse({ accepted: true });
  }

  async completePasswordReset(rawBody: unknown): Promise<IdentityPasswordResetAccepted> {
    const { token, password } = identityPasswordResetCompleteSchema.parse(rawBody);
    const userId = await this.consumeAuthToken(token, "reset");
    const passwordHash = await hash(password, 12);
    await this.db.update(user).set({ passwordHash }).where(eq(user.id, userId));
    await this.db.delete(session).where(eq(session.userId, userId));
    await this.recordAuthEvent({ kind: "reset", userId });
    return identityPasswordResetAcceptedSchema.parse({ accepted: true });
  }

  async logout(userId: string, authorization: string | undefined): Promise<void> {
    const token = bearerTokenFromAuthorization(authorization);
    if (!token) {
      throw new UnauthorizedException();
    }

    const ctx = await this.auth.$context;
    await ctx.internalAdapter.deleteSession(token);
    await this.recordAuthEvent({ kind: "logout", userId });
  }

  async listOwnAuthEvents(userId: string): Promise<AuthEvents> {
    return this.listAuthEventsForUser(userId);
  }

  async listAllAuthEvents(): Promise<AuthEvents> {
    const rows = await this.db
      .select({
        id: authEvent.id,
        kind: authEvent.kind,
        userId: authEvent.userId,
        provider: authEvent.provider,
        createdAt: authEvent.createdAt,
      })
      .from(authEvent)
      .orderBy(desc(authEvent.createdAt));

    return this.parseAuthEvents(rows);
  }

  async listCollectorAuthEvents(userId: string): Promise<AuthEvents> {
    await this.requireUser(userId);
    return this.listAuthEventsForUser(userId);
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.requireUser(userId);
    await this.db.delete(session).where(eq(session.userId, userId));
  }

  async listAuthSecurityDetections(): Promise<AuthSecurityDetections> {
    const pulled = await this.sentinel.listDetections();
    for (const detection of pulled) {
      await this.db
        .insert(authSecurityDetection)
        .values({
          sentinelId: detection.sentinelId,
          kind: detection.kind,
          userId: detection.userId,
          summary: detection.summary,
          detectedAt: detection.detectedAt,
        })
        .onConflictDoUpdate({
          target: authSecurityDetection.sentinelId,
          set: {
            kind: detection.kind,
            userId: detection.userId,
            summary: detection.summary,
            detectedAt: detection.detectedAt,
            updatedAt: new Date(),
          },
        });
    }

    const rows = await this.db
      .select({
        id: authSecurityDetection.id,
        kind: authSecurityDetection.kind,
        userId: authSecurityDetection.userId,
        summary: authSecurityDetection.summary,
        detectedAt: authSecurityDetection.detectedAt,
      })
      .from(authSecurityDetection)
      .orderBy(desc(authSecurityDetection.detectedAt));

    return authSecurityDetectionsSchema.parse({
      detections: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        userId: row.userId,
        summary: row.summary,
        detectedAt: row.detectedAt.toISOString(),
      })),
    });
  }

  async getMe(userId: string): Promise<IdentityMe> {
    const [found] = await this.db
      .select(USER_ME_SELECT)
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!found) {
      throw new UnauthorizedException();
    }

    const linkedAccounts = await this.loadLinkedAccounts(userId);
    return this.toIdentityMe(found, linkedAccounts);
  }

  async getPrefs(userId: string): Promise<IdentityPrefs> {
    const [found] = await this.db
      .select(USER_PREFS_SELECT)
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!found) {
      throw new UnauthorizedException();
    }

    return identityPrefsSchema.parse(found);
  }

  async updatePrefs(userId: string, rawBody: unknown): Promise<IdentityPrefs> {
    const body: IdentityPrefsUpdate = identityPrefsUpdateSchema.parse(rawBody);

    const [updated] = await this.db
      .update(user)
      .set({
        ...(body.pushEnabled !== undefined ? { pushEnabled: body.pushEnabled } : {}),
        ...(body.pushHighPriority !== undefined ? { pushHighPriority: body.pushHighPriority } : {}),
        ...(body.pushOther !== undefined ? { pushOther: body.pushOther } : {}),
        ...(body.emailNews !== undefined ? { emailNews: body.emailNews } : {}),
        ...(body.emailHighPriority !== undefined
          ? { emailHighPriority: body.emailHighPriority }
          : {}),
        ...(body.privacyPersonalised !== undefined
          ? { privacyPersonalised: body.privacyPersonalised }
          : {}),
        ...(body.privacyRecentlySeen !== undefined
          ? { privacyRecentlySeen: body.privacyRecentlySeen }
          : {}),
        ...(body.privacyFavoriteNotifications !== undefined
          ? { privacyFavoriteNotifications: body.privacyFavoriteNotifications }
          : {}),
        ...(body.locale !== undefined ? { locale: body.locale } : {}),
        ...(body.appearance !== undefined ? { appearance: body.appearance } : {}),
      })
      .where(eq(user.id, userId))
      .returning(USER_PREFS_SELECT);

    if (!updated) {
      throw new UnauthorizedException();
    }

    return identityPrefsSchema.parse(updated);
  }

  async getCookieConsent(userId: string): Promise<CookieConsent> {
    const [found] = await this.db
      .select(USER_COOKIE_SELECT)
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!found) {
      throw new UnauthorizedException();
    }

    return cookieConsentSchema.parse({
      analysis: found.cookieAnalysis,
      marketing: found.cookieMarketing,
    });
  }

  async updateCookieConsent(userId: string, rawBody: unknown): Promise<CookieConsent> {
    const body: CookieConsentUpdate = cookieConsentUpdateSchema.parse(rawBody);

    const [updated] = await this.db
      .update(user)
      .set({
        cookieAnalysis: body.analysis,
        cookieMarketing: body.marketing,
      })
      .where(eq(user.id, userId))
      .returning(USER_COOKIE_SELECT);

    if (!updated) {
      throw new UnauthorizedException();
    }

    return cookieConsentSchema.parse({
      analysis: updated.cookieAnalysis,
      marketing: updated.cookieMarketing,
    });
  }

  async exportAccountData(userId: string): Promise<IdentityExport> {
    const [found] = await this.db
      .select({
        id: user.id,
        email: user.email,
        handle: user.handle,
        aboutMe: user.aboutMe,
        fullName: user.fullName,
        phone: user.phone,
        birthday: user.birthday,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!found) {
      throw new UnauthorizedException();
    }

    const jerseys = await this.db
      .select({ id: userJersey.id })
      .from(userJersey)
      .where(eq(userJersey.userId, userId));

    const birthday = formatBirthday(found.birthday);

    return identityExportSchema.parse({
      id: found.id,
      email: found.email,
      handle: found.handle,
      aboutMe: found.aboutMe,
      fullName: found.fullName,
      phone: found.phone,
      birthday,
      userJerseyIds: jerseys.map((row) => row.id),
    });
  }

  async updateAccount(userId: string, rawBody: unknown): Promise<IdentityMe> {
    const body: IdentityAccountUpdate = identityAccountUpdateSchema.parse(rawBody);

    const [updated] = await this.db
      .update(user)
      .set({
        ...(body.fullName !== undefined ? { fullName: body.fullName } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
        ...(body.birthday !== undefined ? { birthday: body.birthday } : {}),
      })
      .where(eq(user.id, userId))
      .returning(USER_ME_SELECT);

    if (!updated) {
      throw new UnauthorizedException();
    }

    const linkedAccounts = await this.loadLinkedAccounts(userId);
    return this.toIdentityMe(updated, linkedAccounts);
  }

  async changePassword(userId: string, rawBody: unknown): Promise<void> {
    const body: IdentityPasswordChange = identityPasswordChangeSchema.parse(rawBody);

    const [found] = await this.db
      .select({ passwordHash: user.passwordHash })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!found) {
      throw new UnauthorizedException();
    }

    const valid = await compare(body.currentPassword, found.passwordHash);
    if (!valid) {
      throw new UnauthorizedException("Current password is incorrect");
    }

    const passwordHash = await hash(body.newPassword, 12);
    await this.db.update(user).set({ passwordHash }).where(eq(user.id, userId));
  }

  async changeEmail(userId: string, rawBody: unknown): Promise<IdentityMe> {
    const body: IdentityEmailChange = identityEmailChangeSchema.parse(rawBody);
    const normalizedEmail = body.email.toLowerCase();

    const [found] = await this.db
      .select({
        email: user.email,
        passwordHash: user.passwordHash,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!found) {
      throw new UnauthorizedException();
    }

    const valid = await compare(body.password, found.passwordHash);
    if (!valid) {
      throw new UnauthorizedException("Current password is incorrect");
    }

    if (normalizedEmail !== found.email) {
      const [existing] = await this.db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, normalizedEmail))
        .limit(1);

      if (existing) {
        throw new ConflictException("Email already registered");
      }
    }

    const [updated] = await this.db
      .update(user)
      .set({ email: normalizedEmail, emailVerified: false })
      .where(eq(user.id, userId))
      .returning(USER_ME_SELECT);

    if (!updated) {
      throw new UnauthorizedException();
    }

    await this.sendAuthMail(userId, updated.email, "verify");
    const linkedAccounts = await this.loadLinkedAccounts(userId);
    return this.toIdentityMe(updated, linkedAccounts);
  }

  async deleteAccount(userId: string): Promise<void> {
    const ownedJerseys = await this.db
      .select({ id: userJersey.id })
      .from(userJersey)
      .where(eq(userJersey.userId, userId));

    const ownedJerseyIds = ownedJerseys.map((row) => row.id);

    const participantConversations = await this.db
      .select({ id: conversation.id })
      .from(conversation)
      .where(
        or(eq(conversation.lowerCollectorId, userId), eq(conversation.upperCollectorId, userId)),
      );

    const jerseyConversations =
      ownedJerseyIds.length > 0
        ? await this.db
            .select({ id: conversation.id })
            .from(conversation)
            .where(inArray(conversation.userJerseyId, ownedJerseyIds))
        : [];

    const conversationIds = [
      ...new Set([
        ...participantConversations.map((row) => row.id),
        ...jerseyConversations.map((row) => row.id),
      ]),
    ];

    await this.db.transaction(async (tx) => {
      if (conversationIds.length > 0) {
        await tx
          .delete(conversationMessage)
          .where(inArray(conversationMessage.conversationId, conversationIds));
        await tx
          .delete(conversationParticipant)
          .where(inArray(conversationParticipant.conversationId, conversationIds));
        await tx.delete(conversation).where(inArray(conversation.id, conversationIds));
      }

      await tx.delete(userJerseyFavorite).where(eq(userJerseyFavorite.collectorId, userId));

      // visionLog and jerseyDraft reference user_jersey — delete before owned jerseys.
      await tx.delete(visionLog).where(eq(visionLog.userId, userId));
      await tx.delete(jerseyDraft).where(eq(jerseyDraft.userId, userId));

      if (ownedJerseyIds.length > 0) {
        await tx
          .delete(userJerseyFavorite)
          .where(inArray(userJerseyFavorite.userJerseyId, ownedJerseyIds));
        await tx
          .delete(userJerseyPhoto)
          .where(inArray(userJerseyPhoto.userJerseyId, ownedJerseyIds));
        await tx.delete(userJersey).where(eq(userJersey.userId, userId));
      }

      await tx.delete(collectionShortcut).where(eq(collectionShortcut.userId, userId));
      await tx.delete(identityProvider).where(eq(identityProvider.userId, userId));
      await tx.delete(user).where(eq(user.id, userId));
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

    if (body.countryId !== undefined && body.countryId !== null) {
      const [countryRow] = await this.db
        .select({ id: country.id })
        .from(country)
        .where(eq(country.id, body.countryId))
        .limit(1);

      if (!countryRow) {
        throw new BadRequestException("Unknown country");
      }
    }

    const [updated] = await this.db
      .update(user)
      .set({
        ...(body.handle !== undefined ? { handle: body.handle } : {}),
        ...(body.aboutMe !== undefined ? { aboutMe: body.aboutMe } : {}),
        ...(body.countryId !== undefined ? { countryId: body.countryId } : {}),
        ...(body.city !== undefined ? { city: body.city } : {}),
        ...(body.showCity !== undefined ? { showCity: body.showCity } : {}),
      })
      .where(eq(user.id, userId))
      .returning(USER_ME_SELECT);

    if (!updated) {
      throw new UnauthorizedException();
    }

    const linkedAccounts = await this.loadLinkedAccounts(userId);
    return this.toIdentityMe(updated, linkedAccounts);
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
      .returning(USER_ME_SELECT);

    if (!updated) {
      throw new UnauthorizedException();
    }

    const linkedAccounts = await this.loadLinkedAccounts(userId);
    return this.toIdentityMe(updated, linkedAccounts, avatarUrlForUser());
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

  async getPeerProfileByHandle(viewerId: string, rawHandle: string): Promise<IdentityPeerProfile> {
    const handle = handleSchema.parse(rawHandle);
    const [peerRow] = await this.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.handle, handle))
      .limit(1);

    if (!peerRow) {
      throw new NotFoundException("Peer not found");
    }

    return this.getPeerProfile(viewerId, peerRow.id);
  }

  async getPeerProfile(viewerId: string, peerUserId: string): Promise<IdentityPeerProfile> {
    if (peerUserId === viewerId) {
      throw new NotFoundException("Peer not found");
    }

    if (await this.moderationService.isBlocked(viewerId, peerUserId)) {
      throw new NotFoundException("Peer not found");
    }

    const [peerRow] = await this.db
      .select({
        id: user.id,
        handle: user.handle,
        aboutMe: user.aboutMe,
        avatarObjectKey: user.avatarObjectKey,
        countryId: user.countryId,
        city: user.city,
        showCity: user.showCity,
      })
      .from(user)
      .where(eq(user.id, peerUserId))
      .limit(1);

    if (!peerRow) {
      throw new NotFoundException("Peer not found");
    }

    const countryLabel = await this.resolveCountryLabel(peerRow.countryId);

    return identityPeerProfileSchema.parse({
      id: peerRow.id,
      handle: peerRow.handle,
      aboutMe: peerRow.aboutMe,
      avatarUrl: peerRow.avatarObjectKey ? avatarUrlForPeer(peerRow.id) : null,
      countryLabel,
      city: peerRow.city,
      showCity: peerRow.showCity,
    });
  }

  async getPeerAvatarBytes(viewerId: string, peerUserId: string): Promise<Uint8Array> {
    await this.getPeerProfile(viewerId, peerUserId);

    const [found] = await this.db
      .select({
        avatarObjectKey: user.avatarObjectKey,
      })
      .from(user)
      .where(eq(user.id, peerUserId))
      .limit(1);

    if (!found?.avatarObjectKey) {
      throw new NotFoundException("Avatar not found");
    }

    if (!found.avatarObjectKey.startsWith(`user/${peerUserId}/`)) {
      throw new NotFoundException("Avatar not found");
    }

    const bytes = await this.objectStore.getObject(found.avatarObjectKey);
    if (!bytes) {
      throw new NotFoundException("Avatar bytes missing");
    }

    return bytes;
  }

  private parseHandleQuery(rawQuery: unknown): string {
    if (typeof rawQuery !== "object" || rawQuery === null) {
      throw new BadRequestException("handle query parameter is required");
    }

    const handleValue = Object.getOwnPropertyDescriptor(rawQuery, "handle")?.value;
    if (typeof handleValue !== "string") {
      throw new BadRequestException("handle query parameter is required");
    }

    try {
      return handleSchema.parse(handleValue);
    } catch {
      throw new BadRequestException("handle query parameter is invalid");
    }
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

  private async persistProviderLink(input: {
    userId: string;
    provider: IdentityLinkedProvider;
    providerUserId: string;
  }): Promise<void> {
    const [existingLink] = await this.db
      .select({ id: identityProvider.id })
      .from(identityProvider)
      .where(
        and(
          eq(identityProvider.provider, input.provider),
          eq(identityProvider.providerUserId, input.providerUserId),
        ),
      )
      .limit(1);

    if (!existingLink) {
      await this.db.insert(identityProvider).values({
        userId: input.userId,
        provider: input.provider,
        providerUserId: input.providerUserId,
      });
      await this.recordAuthEvent({
        kind: "provider_link",
        userId: input.userId,
        provider: input.provider,
      });
    }

    const [existingAccount] = await this.db
      .select({ id: account.id })
      .from(account)
      .where(
        and(eq(account.providerId, input.provider), eq(account.accountId, input.providerUserId)),
      )
      .limit(1);

    if (!existingAccount) {
      await this.db.insert(account).values({
        id: randomBytes(16).toString("hex"),
        accountId: input.providerUserId,
        providerId: input.provider,
        userId: input.userId,
      });
    }
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

  private async loadLinkedAccounts(userId: string): Promise<IdentityLinkedAccount[]> {
    const rows = await this.db
      .select({ provider: identityProvider.provider })
      .from(identityProvider)
      .where(eq(identityProvider.userId, userId));

    const linked = new Set(rows.map((row) => row.provider));

    return IDENTITY_LINKED_PROVIDERS.map((provider) => ({
      provider,
      linked: linked.has(provider),
    }));
  }

  private async resolveCountryLabel(countryId: string | null): Promise<string | null> {
    if (!countryId) {
      return null;
    }

    const rows = await this.db
      .select({
        label: catalogLabel.text,
        locale: catalogLabel.locale,
        kind: catalogLabel.kind,
      })
      .from(catalogLabel)
      .where(and(eq(catalogLabel.entityType, "country"), eq(catalogLabel.entityId, countryId)));

    const preferred = rows.find((row) => row.locale === "da" && row.kind === "label");
    if (preferred) {
      return preferred.label;
    }

    const fallback = rows.find((row) => row.kind === "label");
    return fallback?.label ?? null;
  }

  private async toIdentityMe(
    row: {
      id: string;
      email: string;
      role: IdentityRole;
      handle: string;
      aboutMe: string | null;
      avatarObjectKey: string | null;
      fullName: string | null;
      phone: string | null;
      birthday: string | Date | null;
      emailVerified: boolean;
      countryId: string | null;
      city: string | null;
      showCity: boolean;
    },
    linkedAccounts: IdentityLinkedAccount[],
    avatarUrlOverride?: string | null,
  ): Promise<IdentityMe> {
    const birthday = formatBirthday(row.birthday);
    const countryLabel = await this.resolveCountryLabel(row.countryId);
    const entitlement = await this.billingService.getEntitlementForUser(row.id);

    return identityMeSchema.parse({
      id: row.id,
      email: row.email,
      role: row.role,
      handle: row.handle,
      aboutMe: row.aboutMe,
      avatarUrl:
        avatarUrlOverride !== undefined
          ? avatarUrlOverride
          : row.avatarObjectKey
            ? avatarUrlForUser()
            : null,
      emailVerified: row.emailVerified,
      fullName: row.fullName,
      phone: row.phone,
      birthday,
      linkedAccounts,
      countryId: row.countryId,
      countryLabel,
      city: row.city,
      showCity: row.showCity,
      entitlement,
    });
  }

  private hashAuthToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private async sendAuthMail(
    userId: string,
    email: string,
    kind: "verify" | "reset",
  ): Promise<void> {
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + (kind === "reset" ? 60 : 24 * 60) * 60 * 1000);
    await this.db.delete(verification).where(eq(verification.identifier, `${kind}:${userId}`));
    await this.db.insert(verification).values({
      id: randomBytes(16).toString("hex"),
      identifier: `${kind}:${userId}`,
      value: this.hashAuthToken(token),
      expiresAt,
    });
    const origin = requireBetterAuthUrl().replace(/\/$/, "");
    await this.notifyService.sendAuthMail({
      to: email,
      kind,
      url: `${origin}/${kind}?token=${token}`,
    });
  }

  private async consumeAuthToken(token: string, kind: "verify" | "reset"): Promise<string> {
    const hashed = this.hashAuthToken(token);
    const [row] = await this.db
      .select()
      .from(verification)
      .where(eq(verification.value, hashed))
      .limit(1);

    if (!row || !row.identifier.startsWith(`${kind}:`) || row.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException("Invalid or expired token");
    }

    await this.db.delete(verification).where(eq(verification.id, row.id));
    return row.identifier.slice(kind.length + 1);
  }

  private async createSessionToken(userId: string): Promise<string> {
    const ctx = await this.auth.$context;
    const created = await ctx.internalAdapter.createSession(userId);
    if (!created?.token) {
      throw new UnauthorizedException();
    }
    return created.token;
  }

  private async listAuthEventsForUser(userId: string): Promise<AuthEvents> {
    const rows = await this.db
      .select({
        id: authEvent.id,
        kind: authEvent.kind,
        userId: authEvent.userId,
        provider: authEvent.provider,
        createdAt: authEvent.createdAt,
      })
      .from(authEvent)
      .where(eq(authEvent.userId, userId))
      .orderBy(desc(authEvent.createdAt));

    return this.parseAuthEvents(rows);
  }

  private parseAuthEvents(
    rows: Array<{
      id: string;
      kind: AuthEventKind;
      userId: string | null;
      provider: IdentityLinkedProvider | null;
      createdAt: Date;
    }>,
  ): AuthEvents {
    return authEventsSchema.parse({
      events: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        userId: row.userId,
        provider: row.provider,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  }

  private async requireUser(userId: string): Promise<void> {
    const [found] = await this.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    if (!found) {
      throw new NotFoundException();
    }
  }

  private async recordAuthEvent(input: {
    kind: AuthEventKind;
    userId: string | null;
    provider?: IdentityLinkedProvider | null;
  }): Promise<void> {
    await this.db.insert(authEvent).values({
      kind: input.kind,
      userId: input.userId,
      provider: input.provider ?? null,
    });
  }

  private async buildSession(
    row: {
      id: string;
      email: string;
      role: IdentityRole;
      handle: string;
      aboutMe: string | null;
      avatarObjectKey: string | null;
      fullName: string | null;
      phone: string | null;
      birthday: string | Date | null;
      emailVerified: boolean;
      countryId: string | null;
      city: string | null;
      showCity: boolean;
    },
    accessToken: string,
  ): Promise<IdentitySession> {
    const linkedAccounts = await this.loadLinkedAccounts(row.id);

    return identitySessionSchema.parse({
      accessToken,
      user: await this.toIdentityMe(row, linkedAccounts),
    });
  }
}
