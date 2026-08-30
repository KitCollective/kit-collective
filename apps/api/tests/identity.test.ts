import "reflect-metadata";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectionFavoritesSchema,
  collectionJerseysSchema,
  collectionSaveResponseSchema,
  cookieConsentSchema,
  handleAvailabilityResponseSchema,
  identityExportSchema,
  identityMeSchema,
  identityPrefsSchema,
  identitySessionSchema,
} from "@kit/api-contract";
import {
  catalogLabel,
  club,
  country,
  createDb,
  league,
  resetDatabase,
  season,
  teamSeason,
} from "@kit/db";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../dist/app.module.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/db/migrations",
);

const DATABASE_URL =
  process.env.API_TEST_DATABASE_URL ?? "postgresql://kit:kit@localhost:5432/kit_api_test";

const JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFwABAQEBAAAAAAAAAAAAAAAAAAUGB//EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//2Q==";

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

async function insertClubSeasonFixture() {
  const { db, pool } = createDb(DATABASE_URL);

  const [insertedCountry] = await db
    .insert(country)
    .values({ iso3166: "DK" })
    .returning({ id: country.id });
  if (!insertedCountry) {
    throw new Error("Expected country insert to return a row");
  }

  const [insertedLeague] = await db
    .insert(league)
    .values({ countryId: insertedCountry.id })
    .returning({ id: league.id });
  if (!insertedLeague) {
    throw new Error("Expected league insert to return a row");
  }

  const [insertedClub] = await db
    .insert(club)
    .values({ countryId: insertedCountry.id, kind: "club" })
    .returning({ id: club.id });
  if (!insertedClub) {
    throw new Error("Expected club insert to return a row");
  }

  const [insertedSeason] = await db
    .insert(season)
    .values({
      leagueId: insertedLeague.id,
      label: "2023/24",
      startsOn: "2023-07-01",
      endsOn: "2024-06-30",
      calendarKind: "split_year",
    })
    .returning({ id: season.id });
  if (!insertedSeason) {
    throw new Error("Expected season insert to return a row");
  }

  await db.insert(teamSeason).values({
    clubId: insertedClub.id,
    seasonId: insertedSeason.id,
  });

  await db.insert(catalogLabel).values([
    {
      entityType: "country",
      entityId: insertedCountry.id,
      locale: "da",
      kind: "label",
      text: "Danmark",
      source: "seed",
    },
    {
      entityType: "league",
      entityId: insertedLeague.id,
      locale: "da",
      kind: "label",
      text: "Superligaen",
      source: "seed",
    },
    {
      entityType: "club",
      entityId: insertedClub.id,
      locale: "da",
      kind: "label",
      text: "F.C. København",
      source: "seed",
    },
  ]);

  await pool.end();

  return {
    clubId: insertedClub.id,
    seasonId: insertedSeason.id,
  };
}

async function saveJerseyForUser(
  app: NestFastifyApplication,
  session: Awaited<ReturnType<typeof registerSession>>,
  fixture: Awaited<ReturnType<typeof insertClubSeasonFixture>>,
) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/collection/jerseys/save",
    headers: {
      authorization: `Bearer ${session.accessToken}`,
      "accept-language": "da",
    },
    payload: {
      clubId: fixture.clubId,
      seasonId: fixture.seasonId,
      type: "home",
      size: "m",
      condition: "used",
      photos: [{ role: "front", source: "gallery", contentBase64: JPEG_BASE64 }],
    },
  });

  expect(response.statusCode).toBe(201);
  return collectionSaveResponseSchema.parse(JSON.parse(response.body)).jersey;
}

describe("Identity /v1", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.JWT_SECRET = "test-jwt-secret";
    delete process.env.R2_ENDPOINT;
    await resetDatabase(DATABASE_URL, migrationsFolder);

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix("v1");
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("registers a collector and returns a session", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/identity/register",
      payload: {
        email: "collector@example.com",
        password: "password123",
      },
    });

    expect(response.statusCode).toBe(201);
    const body = identitySessionSchema.parse(JSON.parse(response.body));
    expect(body.user.email).toBe("collector@example.com");
    expect(body.user.handle).toBe("collector");
    expect(body.user.role).toBe("user");
    expect(body.user.handle).toBe("collector");
    expect(body.accessToken.length).toBeGreaterThan(10);
  });

  it("assigns a unique handle when the email local-part collides", async () => {
    await registerSession(app, "taken@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/v1/identity/register",
      payload: {
        email: "taken+alias@example.com",
        password: "password123",
      },
    });

    expect(response.statusCode).toBe(201);
    const body = identitySessionSchema.parse(JSON.parse(response.body));
    expect(body.user.handle).toBe("taken_alias");
  });

  it("logs in with email and password", async () => {
    await app.inject({
      method: "POST",
      url: "/v1/identity/register",
      payload: {
        email: "login@example.com",
        password: "password123",
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/identity/login",
      payload: {
        email: "login@example.com",
        password: "password123",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = identitySessionSchema.parse(JSON.parse(response.body));
    expect(body.user.email).toBe("login@example.com");
    expect(body.user.handle).toBe("login");
  });

  it("returns the current user with a valid bearer token", async () => {
    const session = await registerSession(app, "alpha@example.com");

    const response = await app.inject({
      method: "GET",
      url: "/v1/identity/me",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = identityMeSchema.parse(JSON.parse(response.body));
    expect(body.handle).toBe("alpha");
    expect(body.aboutMe).toBeNull();
    expect(body.avatarUrl).toBeNull();
  });

  it("rejects unauthenticated identity requests with 401", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/identity/me",
    });

    expect(response.statusCode).toBe(401);
  });

  it("reports handle availability for yours, available, and taken", async () => {
    const sessionA = await registerSession(app, "avail_a@example.com");
    const sessionB = await registerSession(app, "avail_b@example.com");

    const yours = await app.inject({
      method: "GET",
      url: "/v1/identity/handle-availability?handle=avail_a",
      headers: { authorization: `Bearer ${sessionA.accessToken}` },
    });
    expect(handleAvailabilityResponseSchema.parse(JSON.parse(yours.body))).toEqual({
      handle: "avail_a",
      status: "yours",
    });

    const available = await app.inject({
      method: "GET",
      url: "/v1/identity/handle-availability?handle=freehandle",
      headers: { authorization: `Bearer ${sessionA.accessToken}` },
    });
    expect(handleAvailabilityResponseSchema.parse(JSON.parse(available.body))).toEqual({
      handle: "freehandle",
      status: "available",
    });

    const taken = await app.inject({
      method: "GET",
      url: "/v1/identity/handle-availability?handle=avail_b",
      headers: { authorization: `Bearer ${sessionA.accessToken}` },
    });
    expect(handleAvailabilityResponseSchema.parse(JSON.parse(taken.body))).toEqual({
      handle: "avail_b",
      status: "taken",
    });

    const emailTaken = await app.inject({
      method: "GET",
      url: "/v1/identity/handle-availability?handle=avail_b@example.com",
      headers: { authorization: `Bearer ${sessionB.accessToken}` },
    });
    expect(emailTaken.statusCode).toBe(400);
  });

  it("rejects profile save when the handle is taken", async () => {
    await registerSession(app, "owner@example.com");
    const session = await registerSession(app, "editor@example.com");

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/identity/me",
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { handle: "owner" },
    });

    expect(response.statusCode).toBe(409);
  });

  it("uploads an avatar and returns a non-KitPhoto avatar URL", async () => {
    const session = await registerSession(app, "avatar@example.com");

    const upload = await app.inject({
      method: "POST",
      url: "/v1/identity/avatar",
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { contentBase64: JPEG_BASE64 },
    });

    expect(upload.statusCode).toBe(200);
    const body = identityMeSchema.parse(JSON.parse(upload.body));
    expect(body.avatarUrl).toBe("/v1/identity/avatar");
    expect(body.avatarUrl).not.toContain("kit/");

    const avatarBytes = await app.inject({
      method: "GET",
      url: "/v1/identity/avatar",
      headers: { authorization: `Bearer ${session.accessToken}` },
    });

    expect(avatarBytes.statusCode).toBe(200);
    expect(avatarBytes.headers["content-type"]).toBe("image/jpeg");
  });

  it("rejects unauthenticated collection requests with 401", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/collection/jerseys",
    });

    expect(response.statusCode).toBe(401);
  });

  it("assigns a unique handle with suffix on collision", async () => {
    const first = await app.inject({
      method: "POST",
      url: "/v1/identity/register",
      payload: {
        email: "same@example.com",
        password: "password123",
      },
    });
    const firstSession = identitySessionSchema.parse(JSON.parse(first.body));
    expect(firstSession.user.handle).toBe("same");

    const second = await app.inject({
      method: "POST",
      url: "/v1/identity/register",
      payload: {
        email: "same@other.com",
        password: "password123",
      },
    });
    const secondSession = identitySessionSchema.parse(JSON.parse(second.body));
    expect(secondSession.user.handle).toBe("same2");
    expect(secondSession.user.handle).not.toBe(secondSession.user.email);
  });

  it("returns an empty jersey list for an authenticated collector", async () => {
    const session = await registerSession(app, "empty@example.com");

    const response = await app.inject({
      method: "GET",
      url: "/v1/collection/jerseys",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = collectionJerseysSchema.parse(JSON.parse(response.body));
    expect(body).toEqual({ jerseys: [] });
  });

  it("changes password on the email+password path", async () => {
    const session = await registerSession(app, "password-change@example.com");

    const change = await app.inject({
      method: "POST",
      url: "/v1/identity/password",
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: {
        currentPassword: "password123",
        newPassword: "newpassword456",
      },
    });

    expect(change.statusCode).toBe(200);

    const oldLogin = await app.inject({
      method: "POST",
      url: "/v1/identity/login",
      payload: {
        email: "password-change@example.com",
        password: "password123",
      },
    });
    expect(oldLogin.statusCode).toBe(401);

    const newLogin = await app.inject({
      method: "POST",
      url: "/v1/identity/login",
      payload: {
        email: "password-change@example.com",
        password: "newpassword456",
      },
    });
    expect(newLogin.statusCode).toBe(200);
  });

  it("returns account fields on GET me", async () => {
    const session = await registerSession(app, "account@example.com");

    const patch = await app.inject({
      method: "PATCH",
      url: "/v1/identity/account",
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: {
        fullName: "Ada Lovelace",
        phone: "+4512345678",
        birthday: "1990-05-15",
      },
    });
    expect(patch.statusCode).toBe(200);

    const me = await app.inject({
      method: "GET",
      url: "/v1/identity/me",
      headers: { authorization: `Bearer ${session.accessToken}` },
    });

    expect(me.statusCode).toBe(200);
    const body = identityMeSchema.parse(JSON.parse(me.body));
    expect(body.emailVerified).toBe(true);
    expect(body.fullName).toBe("Ada Lovelace");
    expect(body.phone).toBe("+4512345678");
    expect(body.birthday).toBe("1990-05-15");
    expect(body.linkedAccounts).toEqual([
      { provider: "google", linked: false },
      { provider: "facebook", linked: false },
    ]);
  });

  it("changes email on the email+password path", async () => {
    const session = await registerSession(app, "email-change@example.com");

    const change = await app.inject({
      method: "POST",
      url: "/v1/identity/email",
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: {
        email: "new-email@example.com",
        password: "password123",
      },
    });

    expect(change.statusCode).toBe(200);
    const body = identityMeSchema.parse(JSON.parse(change.body));
    expect(body.email).toBe("new-email@example.com");

    const oldLogin = await app.inject({
      method: "POST",
      url: "/v1/identity/login",
      payload: {
        email: "email-change@example.com",
        password: "password123",
      },
    });
    expect(oldLogin.statusCode).toBe(401);

    const newLogin = await app.inject({
      method: "POST",
      url: "/v1/identity/login",
      payload: {
        email: "new-email@example.com",
        password: "password123",
      },
    });
    expect(newLogin.statusCode).toBe(200);
  });

  it("accepts logout and rejects GET me without a session token", async () => {
    const session = await registerSession(app, "logout@example.com");

    const logout = await app.inject({
      method: "POST",
      url: "/v1/identity/logout",
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(logout.statusCode).toBe(204);
    expect(logout.body).toBe("");

    const me = await app.inject({
      method: "GET",
      url: "/v1/identity/me",
    });
    expect(me.statusCode).toBe(401);
  });

  it("deletes the account so subsequent GET me is 401", async () => {
    const session = await registerSession(app, "delete-me@example.com");

    const del = await app.inject({
      method: "DELETE",
      url: "/v1/identity/me",
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(del.statusCode).toBe(204);

    const me = await app.inject({
      method: "GET",
      url: "/v1/identity/me",
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(me.statusCode).toBe(401);
  });

  it("deletes account, owned jerseys, and favorites so GET me is 401 and foreign favorites empty", async () => {
    const fixture = await insertClubSeasonFixture();
    const owner = await registerSession(app, "delete-owner@example.com");
    const favoriter = await registerSession(app, "delete-favoriter@example.com");
    const ownerJersey = await saveJerseyForUser(app, owner, fixture);

    const addFavorite = await app.inject({
      method: "POST",
      url: "/v1/collection/favorites",
      headers: { authorization: `Bearer ${favoriter.accessToken}` },
      payload: { userJerseyId: ownerJersey.id },
    });
    expect(addFavorite.statusCode).toBe(201);

    const listBefore = await app.inject({
      method: "GET",
      url: "/v1/collection/favorites",
      headers: {
        authorization: `Bearer ${favoriter.accessToken}`,
        "accept-language": "da",
      },
    });
    expect(collectionFavoritesSchema.parse(JSON.parse(listBefore.body)).favorites).toHaveLength(1);

    const ownerCollection = await app.inject({
      method: "GET",
      url: "/v1/collection/jerseys",
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    expect(collectionJerseysSchema.parse(JSON.parse(ownerCollection.body)).jerseys).toHaveLength(1);

    const del = await app.inject({
      method: "DELETE",
      url: "/v1/identity/me",
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    expect(del.statusCode).toBe(204);

    const me = await app.inject({
      method: "GET",
      url: "/v1/identity/me",
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    expect(me.statusCode).toBe(401);

    const login = await app.inject({
      method: "POST",
      url: "/v1/identity/login",
      payload: {
        email: "delete-owner@example.com",
        password: "password123",
      },
    });
    expect(login.statusCode).toBe(401);

    const emptyFavorites = await app.inject({
      method: "GET",
      url: "/v1/collection/favorites",
      headers: {
        authorization: `Bearer ${favoriter.accessToken}`,
        "accept-language": "da",
      },
    });
    expect(emptyFavorites.statusCode).toBe(200);
    expect(collectionFavoritesSchema.parse(JSON.parse(emptyFavorites.body)).favorites).toHaveLength(
      0,
    );
  });

  it("returns 401 for export without session", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/identity/export",
    });
    expect(response.statusCode).toBe(401);
  });

  it("round-trips notification and privacy prefs", async () => {
    const session = await registerSession(app, "prefs-roundtrip@example.com");

    const initial = await app.inject({
      method: "GET",
      url: "/v1/identity/prefs",
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(initial.statusCode).toBe(200);
    const defaults = identityPrefsSchema.parse(JSON.parse(initial.body));
    expect(defaults.emailNews).toBe(false);
    expect(defaults.emailHighPriority).toBe(true);

    const patch = await app.inject({
      method: "PATCH",
      url: "/v1/identity/prefs",
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: {
        pushEnabled: true,
        pushHighPriority: false,
        locale: "en",
        appearance: "dark",
        privacyPersonalised: false,
      },
    });
    expect(patch.statusCode).toBe(200);
    const updated = identityPrefsSchema.parse(JSON.parse(patch.body));
    expect(updated).toMatchObject({
      pushEnabled: true,
      pushHighPriority: false,
      locale: "en",
      appearance: "dark",
      privacyPersonalised: false,
    });

    const again = await app.inject({
      method: "GET",
      url: "/v1/identity/prefs",
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(identityPrefsSchema.parse(JSON.parse(again.body))).toEqual(updated);
  });

  it("persists essential-only cookie consent with analysis false", async () => {
    const session = await registerSession(app, "cookie-essential@example.com");

    const patch = await app.inject({
      method: "PATCH",
      url: "/v1/identity/cookie-consent",
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { analysis: false, marketing: false },
    });
    expect(patch.statusCode).toBe(200);
    expect(cookieConsentSchema.parse(JSON.parse(patch.body))).toEqual({
      analysis: false,
      marketing: false,
    });

    const get = await app.inject({
      method: "GET",
      url: "/v1/identity/cookie-consent",
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(cookieConsentSchema.parse(JSON.parse(get.body))).toEqual({
      analysis: false,
      marketing: false,
    });
  });

  it("returns authenticated export with profile fields and jersey ids", async () => {
    const session = await registerSession(app, "export-owner@example.com");
    const fixture = await insertClubSeasonFixture();
    const jersey = await saveJerseyForUser(app, session, fixture);

    const response = await app.inject({
      method: "GET",
      url: "/v1/identity/export",
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(response.statusCode).toBe(200);
    const payload = identityExportSchema.parse(JSON.parse(response.body));
    expect(payload.email).toBe("export-owner@example.com");
    expect(payload.userJerseyIds).toContain(jersey.id);
  });
});
