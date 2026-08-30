import "reflect-metadata";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  billingPaywallErrorSchema,
  identitySessionSchema,
  wishlistEntriesSchema,
  wishlistEntrySchema,
} from "@kit/api-contract";
import {
  catalogLabel,
  club,
  country,
  createDb,
  entitlement,
  league,
  resetDatabase,
  season,
  teamSeason,
} from "@kit/db";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../dist/app.module.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/db/migrations",
);

const DATABASE_URL =
  process.env.API_TEST_DATABASE_URL ?? "postgresql://kit:kit@localhost:5432/kit_api_test";

async function prepareDatabase() {
  await resetDatabase(DATABASE_URL, migrationsFolder);
}

async function registerSession(app: NestFastifyApplication, email: string) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/identity/register",
    payload: {
      email,
      password: "password123",
    },
  });

  return identitySessionSchema.parse(JSON.parse(response.body));
}

async function startTrial(app: NestFastifyApplication, accessToken: string) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/billing/trial",
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
  expect(response.statusCode).toBe(200);
}

type Fixture = {
  clubId: string;
  seasonId: string;
  clubLabelDa: string;
  seasonLabel: string;
};

async function insertFixture(): Promise<Fixture> {
  const { db, pool } = createDb(DATABASE_URL);

  const [insertedCountry] = await db
    .insert(country)
    .values({ iso3166: "DK" })
    .returning({ id: country.id });

  const [insertedLeague] = await db
    .insert(league)
    .values({ countryId: insertedCountry!.id })
    .returning({ id: league.id });

  const [insertedClub] = await db
    .insert(club)
    .values({ countryId: insertedCountry!.id, kind: "club" })
    .returning({ id: club.id });

  const seasonLabel = "2023/24";
  const [insertedSeason] = await db
    .insert(season)
    .values({
      leagueId: insertedLeague!.id,
      label: seasonLabel,
      startsOn: "2023-07-01",
      endsOn: "2024-06-30",
      calendarKind: "split_year",
    })
    .returning({ id: season.id });

  await db.insert(teamSeason).values({
    clubId: insertedClub!.id,
    seasonId: insertedSeason!.id,
  });

  const clubLabelDa = "F.C. København";
  await db.insert(catalogLabel).values({
    entityType: "club",
    entityId: insertedClub!.id,
    locale: "da",
    kind: "label",
    text: clubLabelDa,
    source: "seed",
  });

  await pool.end();

  return {
    clubId: insertedClub!.id,
    seasonId: insertedSeason!.id,
    clubLabelDa,
    seasonLabel,
  };
}

describe("Wishlist /v1", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.JWT_SECRET = "test-jwt-secret";
    delete process.env.R2_ENDPOINT;
    await prepareDatabase();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication(new FastifyAdapter());
    app.setGlobalPrefix("v1");
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    const { pool } = createDb(DATABASE_URL);
    await pool.end();
  });

  it("returns 401 for wishlist calls without session", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/wishlist/entries",
    });

    expect(response.statusCode).toBe(401);
  });

  it("creates, lists, updates, and deletes own wishlist entries with live entitlement", async () => {
    const fixture = await insertFixture();
    const session = await registerSession(app, "wishlist-crud@example.com");
    await startTrial(app, session.accessToken);

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/wishlist/entries",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        "accept-language": "da",
      },
      payload: {
        clubId: fixture.clubId,
        seasonId: fixture.seasonId,
        type: "home",
        size: "m",
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const created = wishlistEntrySchema.parse(JSON.parse(createResponse.body));
    expect(created.clubLabel).toBe(fixture.clubLabelDa);
    expect(created.seasonLabel).toBe(fixture.seasonLabel);
    expect(created.name).toContain(fixture.clubLabelDa);
    expect(created.meta).toContain("Hjemme");

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/wishlist/entries",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        "accept-language": "da",
      },
    });

    expect(listResponse.statusCode).toBe(200);
    const listed = wishlistEntriesSchema.parse(JSON.parse(listResponse.body));
    expect(listed.entries).toHaveLength(1);

    const patchResponse = await app.inject({
      method: "PATCH",
      url: `/v1/wishlist/entries/${created.id}`,
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        "accept-language": "da",
      },
      payload: {
        type: "away",
      },
    });

    expect(patchResponse.statusCode).toBe(200);
    const updated = wishlistEntrySchema.parse(JSON.parse(patchResponse.body));
    expect(updated.type).toBe("away");
    expect(updated.clubId).toBeNull();
    expect(updated.seasonId).toBeNull();

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/v1/wishlist/entries/${created.id}`,
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });

    expect(deleteResponse.statusCode).toBe(204);
  });

  it("rejects write without at least one of clubId, seasonId, or type", async () => {
    const session = await registerSession(app, "wishlist-and@example.com");
    await startTrial(app, session.accessToken);

    const response = await app.inject({
      method: "POST",
      url: "/v1/wishlist/entries",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        size: "m",
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns paywall code on POST when entitlement lapsed", async () => {
    const session = await registerSession(app, "wishlist-lapse-post@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/v1/wishlist/entries",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        type: "home",
      },
    });

    expect(response.statusCode).toBe(402);
    const body = JSON.parse(response.body);
    expect(billingPaywallErrorSchema.parse(body)).toEqual({
      code: "PREMIUM_REQUIRED",
      message: "Premium is required",
    });
  });

  it("returns paywall code on PATCH when entitlement lapsed", async () => {
    const fixture = await insertFixture();
    const session = await registerSession(app, "wishlist-lapse-patch@example.com");
    await startTrial(app, session.accessToken);

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/wishlist/entries",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        clubId: fixture.clubId,
      },
    });
    const created = wishlistEntrySchema.parse(JSON.parse(createResponse.body));

    const { db, pool } = createDb(DATABASE_URL);
    await db.delete(entitlement).where(eq(entitlement.userId, session.user.id));
    await pool.end();

    const patchResponse = await app.inject({
      method: "PATCH",
      url: `/v1/wishlist/entries/${created.id}`,
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        type: "home",
      },
    });

    expect(patchResponse.statusCode).toBe(402);
    expect(billingPaywallErrorSchema.parse(JSON.parse(patchResponse.body)).code).toBe(
      "PREMIUM_REQUIRED",
    );
  });

  it("allows DELETE after entitlement lapse", async () => {
    const fixture = await insertFixture();
    const session = await registerSession(app, "wishlist-lapse-delete@example.com");
    await startTrial(app, session.accessToken);

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/wishlist/entries",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        clubId: fixture.clubId,
      },
    });
    const created = wishlistEntrySchema.parse(JSON.parse(createResponse.body));

    const { db, pool } = createDb(DATABASE_URL);
    await db.delete(entitlement).where(eq(entitlement.userId, session.user.id));
    await pool.end();

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/v1/wishlist/entries/${created.id}`,
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });

    expect(deleteResponse.statusCode).toBe(204);
  });

  it("returns 404/403 when another collector writes an entry they do not own", async () => {
    const fixture = await insertFixture();
    const owner = await registerSession(app, "wishlist-owner@example.com");
    const other = await registerSession(app, "wishlist-other@example.com");
    await startTrial(app, owner.accessToken);
    await startTrial(app, other.accessToken);

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/wishlist/entries",
      headers: {
        authorization: `Bearer ${owner.accessToken}`,
      },
      payload: {
        clubId: fixture.clubId,
      },
    });
    const created = wishlistEntrySchema.parse(JSON.parse(createResponse.body));

    const patchResponse = await app.inject({
      method: "PATCH",
      url: `/v1/wishlist/entries/${created.id}`,
      headers: {
        authorization: `Bearer ${other.accessToken}`,
      },
      payload: {
        type: "home",
      },
    });

    expect([403, 404]).toContain(patchResponse.statusCode);
  });
});
