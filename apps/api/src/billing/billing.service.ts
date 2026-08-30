import {
  type BillingStartTrialResponse,
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
} from "@kit/api-contract";
import { entitlement, offer } from "@kit/db";
import { entitlementSourceForIapPlatform } from "@kit/domain";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DB, type DbToken } from "../db/db.module.js";
import { IapVerificationFailedError } from "./fake-iap.adapter.js";
import {
  IAP_VERIFIER,
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

function toEntitlementView(row: {
  source: "iap_apple" | "iap_google" | "trial" | "comp" | null;
  expires: Date | null;
  trialUsed: boolean;
}): Entitlement {
  return entitlementSchema.parse({
    live: isEntitlementLive(row.source, row.expires),
    source: row.source,
    expires: row.expires ? row.expires.toISOString() : null,
    trialUsed: row.trialUsed,
  });
}

const inactiveEntitlement = (): Entitlement =>
  entitlementSchema.parse({
    live: false,
    source: null,
    expires: null,
    trialUsed: false,
  });

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
<<<<<<< HEAD

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
=======
>>>>>>> origin/kit-134

  async getEntitlementForUser(userId: string): Promise<Entitlement> {
    const [row] = await this.db
      .select()
      .from(entitlement)
      .where(eq(entitlement.userId, userId))
      .limit(1);

    if (!row) {
      return inactiveEntitlement();
    }

    return toEntitlementView(row);
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

      return grantCompResponseSchema.parse(toEntitlementView(updated));
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

    return grantCompResponseSchema.parse(toEntitlementView(created));
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

      return toEntitlementView(updated);
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

    return billingStartTrialResponseSchema.parse(toEntitlementView(created));
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

      return toEntitlementView(updated);
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

    return toEntitlementView(created);
  }
}
