import {
  type BillingStartTrialResponse,
  billingPaywallErrorSchema,
  billingStartTrialResponseSchema,
  type Entitlement,
  entitlementSchema,
  type GrantCompRequest,
  grantCompRequestSchema,
  grantCompResponseSchema,
  type IapRestoreRequest,
  type IapVerifyRequest,
  iapRestoreRequestSchema,
  iapVerifyRequestSchema,
  type Offer,
  type OfferPatchRequest,
  offerPatchRequestSchema,
  offerSchema,
  type VisionMatcherUsage,
  visionMatcherUsageSchema,
} from "@kit/api-contract";
import { entitlement, offer, visionLog } from "@kit/db";
import {
  entitlementSourceForIapPlatform,
  VISION_MATCHER_JERSEY_CAP,
  VISION_MATCHER_WINDOW_DAYS,
} from "@kit/domain";
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { and, eq, gt } from "drizzle-orm";
import { entitlementGateIsOff } from "../config/entitlement-gate.js";
import { DB, type DbToken } from "../db/db.module.js";
import {
  IAP_VERIFIER,
  IapVerificationFailedError,
  type IapVerificationResult,
  type IapVerifierAdapter,
} from "./iap-verifier.adapter.js";

function isEntitlementLive(source: string | null, expires: Date | null): boolean {
  if (!source) {
    return false;
  }

  if (!expires) {
    return true;
  }

  return expires.getTime() > Date.now();
}

function toVisionMatcherUsage(
  counted: { used: number; renewsAt: Date | null },
  live: boolean,
): VisionMatcherUsage {
  const { used, renewsAt } = counted;
  return visionMatcherUsageSchema.parse({
    used,
    cap: VISION_MATCHER_JERSEY_CAP,
    remaining: live ? VISION_MATCHER_JERSEY_CAP : Math.max(0, VISION_MATCHER_JERSEY_CAP - used),
    unlimited: live,
    renewsAt: live || !renewsAt ? null : renewsAt.toISOString(),
  });
}

function toEntitlementView(
  row: {
    source: "iap_apple" | "iap_google" | "trial" | "comp" | null;
    expires: Date | null;
    trialUsed: boolean;
  },
  counted: { used: number; renewsAt: Date | null },
): Entitlement {
  const live = isEntitlementLive(row.source, row.expires);
  return entitlementSchema.parse({
    live,
    source: row.source,
    expires: row.expires ? row.expires.toISOString() : null,
    trialUsed: row.trialUsed,
    visionMatcher: toVisionMatcherUsage(counted, live),
  });
}

function throwPremiumRequired(): never {
  throw new HttpException(
    billingPaywallErrorSchema.parse({
      code: "PREMIUM_REQUIRED",
      message: "Premium is required",
    }),
    HttpStatus.PAYMENT_REQUIRED,
  );
}

function toOfferView(row: {
  monthProductId: string;
  yearProductId: string;
  trialEnabled: boolean;
  trialDays: number;
}): Offer {
  return offerSchema.parse({
    monthProductId: row.monthProductId,
    yearProductId: row.yearProductId,
    trialEnabled: row.trialEnabled,
    trialDays: row.trialDays,
  });
}

@Injectable()
export class BillingService {
  constructor(
    @Inject(DB) private readonly db: DbToken,
    @Inject(IAP_VERIFIER) private readonly iapVerifier: IapVerifierAdapter,
  ) {}

  async getOffer(): Promise<Offer> {
    const [activeOffer] = await this.db.select().from(offer).limit(1);
    if (!activeOffer) {
      throw new ServiceUnavailableException("Offer is not configured");
    }
    return toOfferView(activeOffer);
  }

  async updateOffer(body: OfferPatchRequest): Promise<Offer> {
    const parsed = offerPatchRequestSchema.parse(body);
    const [activeOffer] = await this.db.select().from(offer).limit(1);
    if (!activeOffer) {
      throw new ServiceUnavailableException("Offer is not configured");
    }

    const [updated] = await this.db
      .update(offer)
      .set({
        monthProductId: parsed.monthProductId,
        yearProductId: parsed.yearProductId,
        trialEnabled: parsed.trialEnabled,
        trialDays: parsed.trialDays,
      })
      .where(eq(offer.id, activeOffer.id))
      .returning();

    if (!updated) {
      throw new ServiceUnavailableException("Could not update offer");
    }

    return toOfferView(updated);
  }

  async getEntitlementForUser(userId: string): Promise<Entitlement> {
    const counted = await this.listCountedIdentityDraftKeys(userId);
    const [row] = await this.db
      .select()
      .from(entitlement)
      .where(eq(entitlement.userId, userId))
      .limit(1);

    if (entitlementGateIsOff()) {
      return entitlementSchema.parse({
        live: true,
        source: row?.source ?? "comp",
        expires: null,
        trialUsed: row?.trialUsed ?? false,
        visionMatcher: toVisionMatcherUsage(counted, true),
      });
    }

    if (!row) {
      return entitlementSchema.parse({
        live: false,
        source: null,
        expires: null,
        trialUsed: false,
        visionMatcher: toVisionMatcherUsage(counted, false),
      });
    }

    return toEntitlementView(row, counted);
  }

  async canEnqueueIdentityVision(userId: string, draftId?: string): Promise<boolean> {
    const entitlementView = await this.getEntitlementForUser(userId);
    if (entitlementView.live) {
      return true;
    }

    const counted = await this.listCountedIdentityDraftKeys(userId);
    if (draftId && counted.draftIds.has(draftId)) {
      return true;
    }

    return counted.used < VISION_MATCHER_JERSEY_CAP;
  }

  async assertIdentityVisionAllowed(userId: string, draftId?: string): Promise<void> {
    if (await this.canEnqueueIdentityVision(userId, draftId)) {
      return;
    }

    throwPremiumRequired();
  }

  private async listCountedIdentityDraftKeys(userId: string): Promise<{
    used: number;
    draftIds: Set<string>;
    renewsAt: Date | null;
  }> {
    const windowStart = new Date(Date.now() - VISION_MATCHER_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const rows = await this.db
      .select({ draftId: visionLog.draftId, createdAt: visionLog.createdAt })
      .from(visionLog)
      .where(
        and(
          eq(visionLog.userId, userId),
          eq(visionLog.kind, "identity"),
          eq(visionLog.status, "ready"),
          gt(visionLog.createdAt, windowStart),
        ),
      );

    // A draft stays counted until its newest ready run leaves the window, so the run that frees
    // a slot first is the one whose newest counted entry is oldest.
    const newestByDraft = new Map<string, Date>();
    let nullDraftCount = 0;
    let oldestFreeing: Date | null = null;
    for (const row of rows) {
      if (row.draftId) {
        const known = newestByDraft.get(row.draftId);
        if (!known || row.createdAt > known) {
          newestByDraft.set(row.draftId, row.createdAt);
        }
      } else {
        nullDraftCount += 1;
        if (!oldestFreeing || row.createdAt < oldestFreeing) {
          oldestFreeing = row.createdAt;
        }
      }
    }
    for (const newest of newestByDraft.values()) {
      if (!oldestFreeing || newest < oldestFreeing) {
        oldestFreeing = newest;
      }
    }

    return {
      used: newestByDraft.size + nullDraftCount,
      draftIds: new Set(newestByDraft.keys()),
      renewsAt: oldestFreeing
        ? new Date(oldestFreeing.getTime() + VISION_MATCHER_WINDOW_DAYS * 24 * 60 * 60 * 1000)
        : null,
    };
  }

  private async toView(
    userId: string,
    row: {
      source: "iap_apple" | "iap_google" | "trial" | "comp" | null;
      expires: Date | null;
      trialUsed: boolean;
    },
  ): Promise<Entitlement> {
    return toEntitlementView(row, await this.listCountedIdentityDraftKeys(userId));
  }

  async grantComp(userId: string, body: GrantCompRequest): Promise<Entitlement> {
    const parsed = grantCompRequestSchema.parse(body);
    const expires = new Date(parsed.expires);

    const [existing] = await this.db
      .select()
      .from(entitlement)
      .where(eq(entitlement.userId, userId))
      .limit(1);

    if (existing) {
      const [updated] = await this.db
        .update(entitlement)
        .set({
          source: "comp",
          expires,
          updatedAt: new Date(),
        })
        .where(eq(entitlement.userId, userId))
        .returning();

      if (!updated) {
        throw new NotFoundException("Entitlement not found");
      }

      return grantCompResponseSchema.parse(await this.toView(userId, updated));
    }

    const [created] = await this.db
      .insert(entitlement)
      .values({
        userId,
        source: "comp",
        expires,
        trialUsed: false,
      })
      .returning();

    if (!created) {
      throw new ServiceUnavailableException("Could not grant comp");
    }

    return grantCompResponseSchema.parse(await this.toView(userId, created));
  }

  async startTrial(userId: string): Promise<BillingStartTrialResponse> {
    const [activeOffer] = await this.db.select().from(offer).limit(1);
    if (!activeOffer) {
      throw new ServiceUnavailableException("Offer is not configured");
    }

    if (!activeOffer.trialEnabled || activeOffer.trialDays <= 0) {
      throw new ConflictException("Trial is not available");
    }

    const [existing] = await this.db
      .select()
      .from(entitlement)
      .where(eq(entitlement.userId, userId))
      .limit(1);

    if (existing?.trialUsed) {
      throw new ConflictException("Trial already used");
    }

    const expires = new Date(Date.now() + activeOffer.trialDays * 24 * 60 * 60 * 1000);

    if (existing) {
      const [updated] = await this.db
        .update(entitlement)
        .set({
          source: "trial",
          expires,
          trialUsed: true,
          updatedAt: new Date(),
        })
        .where(eq(entitlement.userId, userId))
        .returning();

      if (!updated) {
        throw new NotFoundException("Entitlement not found");
      }

      return this.toView(userId, updated);
    }

    const [created] = await this.db
      .insert(entitlement)
      .values({
        userId,
        source: "trial",
        expires,
        trialUsed: true,
      })
      .returning();

    if (!created) {
      throw new ServiceUnavailableException("Could not start trial");
    }

    return billingStartTrialResponseSchema.parse(await this.toView(userId, created));
  }

  async verifyPurchase(userId: string, rawBody: unknown): Promise<Entitlement> {
    const body: IapVerifyRequest = iapVerifyRequestSchema.parse(rawBody);
    const [activeOffer] = await this.db.select().from(offer).limit(1);
    if (!activeOffer) {
      throw new ServiceUnavailableException("Offer is not configured");
    }

    if (
      body.productId !== activeOffer.monthProductId &&
      body.productId !== activeOffer.yearProductId
    ) {
      throw new BadRequestException("Unknown product id");
    }

    let verification: IapVerificationResult;
    try {
      verification = await this.iapVerifier.verify(body.token, body.platform, body.productId);
    } catch (error) {
      if (error instanceof IapVerificationFailedError) {
        throw new UnprocessableEntityException("Invalid purchase token");
      }
      throw error;
    }

    const source = entitlementSourceForIapPlatform(body.platform);
    return this.upsertIapEntitlement(userId, source, verification.expires);
  }

  async restorePurchases(userId: string, rawBody: unknown): Promise<Entitlement> {
    const body: IapRestoreRequest = iapRestoreRequestSchema.parse(rawBody);
    let verification: IapVerificationResult | null;
    try {
      verification = await this.iapVerifier.restore(body.token, body.platform);
    } catch (error) {
      if (error instanceof IapVerificationFailedError) {
        throw new UnprocessableEntityException("Invalid purchase token");
      }
      throw error;
    }

    if (!verification) {
      return this.getEntitlementForUser(userId);
    }

    const source = entitlementSourceForIapPlatform(body.platform);
    return this.upsertIapEntitlement(userId, source, verification.expires);
  }

  private async upsertIapEntitlement(
    userId: string,
    source: "iap_apple" | "iap_google",
    expires: Date,
  ): Promise<Entitlement> {
    const [existing] = await this.db
      .select()
      .from(entitlement)
      .where(eq(entitlement.userId, userId))
      .limit(1);

    if (existing) {
      const [updated] = await this.db
        .update(entitlement)
        .set({
          source,
          expires,
          updatedAt: new Date(),
        })
        .where(eq(entitlement.userId, userId))
        .returning();

      if (!updated) {
        throw new NotFoundException("Entitlement not found");
      }

      return this.toView(userId, updated);
    }

    const [created] = await this.db
      .insert(entitlement)
      .values({
        userId,
        source,
        expires,
        trialUsed: false,
      })
      .returning();

    if (!created) {
      throw new ServiceUnavailableException("Could not persist entitlement");
    }

    return this.toView(userId, created);
  }
}
