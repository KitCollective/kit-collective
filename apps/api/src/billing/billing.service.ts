import {
  type BillingStartTrialResponse,
  billingStartTrialResponseSchema,
  type Entitlement,
  entitlementSchema,
  type GrantCompRequest,
  grantCompRequestSchema,
  grantCompResponseSchema,
  type Offer,
  type OfferPatchRequest,
  offerPatchRequestSchema,
  offerSchema,
} from "@kit/api-contract";
import { entitlement, offer } from "@kit/db";
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DB, type DbToken } from "../db/db.module.js";

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
  constructor(@Inject(DB) private readonly db: DbToken) {}

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
}
