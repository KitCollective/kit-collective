import "reflect-metadata";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  authEventsSchema,
  collectionFavoritesSchema,
  collectionJerseysSchema,
  collectionSaveResponseSchema,
  cookieConsentSchema,
  handleAvailabilityResponseSchema,
  identityExportSchema,
  identityMeSchema,
  identityPasswordResetAcceptedSchema,
  identityPrefsSchema,
  identitySessionSchema,
  identityVerifyResponseSchema,
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
  user,
} from "@kit/db";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../dist/app.module.js";
import { recordedMails, resetRecordedMails } from "../dist/notify/recording-mailer.adapter.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/db/migrations",
);

const DATABASE_URL =
  process.env.API_TEST_DATABASE_URL ?? "postgresql://kit:kit@localhost:5432/kit_api_test";

const JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFwABAQEBAAAAAAAAAAAAAAAAAAUGB//EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//2Q==";

function fixtureIdToken(input: {
  provider: "google" | "facebook";
  verified: boolean;
  email: string;
  providerUserId: string;
  displayName?: string;
}): string {
  const verification = input.verified ? "verified" : "unverified";
  const token = `test:${input.provider}:${verification}:${input.email}:${input.providerUserId}`;
  return input.displayName === undefined ? token : `${token}:${input.displayName}`;
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
    countryId: insertedCountry.id,
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
    process.env.BETTER_AUTH_SECRET = "test-better-auth-secret-not-for-production";
    process.env.BETTER_AUTH_URL = "http://127.0.0.1:3000";
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
    expect(body.user.emailVerified).toBe(false);
    expect(body.accessToken.length).toBeGreaterThan(10);
  });

  it("leaves emailVerified false until the Notify verify token is consumed", async () => {
    resetRecordedMails();
    const session = await registerSession(app, "verify-me@example.com");
    expect(session.user.emailVerified).toBe(false);

    const mail = recordedMails.find(
      (item) => item.to === "verify-me@example.com" && item.kind === "verify",
    );
    expect(mail?.url).toMatch(/token=/);
    const token = new URL(mail?.url ?? "").searchParams.get("token");
    expect(token).toBeTruthy();

    const verify = await app.inject({
      method: "POST",
      url: "/v1/identity/verify",
      payload: { token },
    });
    expect(verify.statusCode).toBe(200);
    expect(identityVerifyResponseSchema.parse(JSON.parse(verify.body))).toEqual({
      emailVerified: true,
    });

    const me = await app.inject({
      method: "GET",
      url: "/v1/identity/me",
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(identityMeSchema.parse(JSON.parse(me.body)).emailVerified).toBe(true);
  });

  it("returns the same password-reset success whether the email exists", async () => {
    resetRecordedMails();
    await registerSession(app, "reset-known@example.com");
    const known = await app.inject({
      method: "POST",
      url: "/v1/identity/password-reset",
      payload: { email: "reset-known@example.com" },
    });
    const unknown = await app.inject({
      method: "POST",
      url: "/v1/identity/password-reset",
      payload: { email: "reset-unknown@example.com" },
    });
    expect(known.statusCode).toBe(200);
    expect(unknown.statusCode).toBe(200);
    expect(JSON.parse(known.body)).toEqual(JSON.parse(unknown.body));
    expect(identityPasswordResetAcceptedSchema.parse(JSON.parse(known.body))).toEqual({
      accepted: true,
    });
    expect(recordedMails.filter((item) => item.kind === "reset")).toHaveLength(1);
    expect(recordedMails.some((item) => item.to === "reset-unknown@example.com")).toBe(false);
  });

  it("completes reset on the same User and revokes other Auth sessions", async () => {
    resetRecordedMails();
    const first = await registerSession(app, "reset-complete@example.com");
    const secondLogin = await app.inject({
      method: "POST",
      url: "/v1/identity/login",
      payload: { email: "reset-complete@example.com", password: "password123" },
    });
    const second = identitySessionSchema.parse(JSON.parse(secondLogin.body));

    const request = await app.inject({
      method: "POST",
      url: "/v1/identity/password-reset",
      payload: { email: "reset-complete@example.com" },
    });
    expect(request.statusCode).toBe(200);
    const mail = recordedMails.find(
      (item) => item.to === "reset-complete@example.com" && item.kind === "reset",
    );
    const token = new URL(mail?.url ?? "").searchParams.get("token");

    const complete = await app.inject({
      method: "POST",
      url: "/v1/identity/password-reset/complete",
      payload: { token, password: "newpassword123" },
    });
    expect(complete.statusCode).toBe(200);

    const oldFirst = await app.inject({
      method: "GET",
      url: "/v1/identity/me",
      headers: { authorization: `Bearer ${first.accessToken}` },
    });
    const oldSecond = await app.inject({
      method: "GET",
      url: "/v1/identity/me",
      headers: { authorization: `Bearer ${second.accessToken}` },
    });
    expect(oldFirst.statusCode).toBe(401);
    expect(oldSecond.statusCode).toBe(401);

    const relogin = await app.inject({
      method: "POST",
      url: "/v1/identity/login",
      payload: { email: "reset-complete@example.com", password: "newpassword123" },
    });
    expect(relogin.statusCode).toBe(200);
    expect(identitySessionSchema.parse(JSON.parse(relogin.body)).user.id).toBe(first.user.id);

    const events = await app.inject({
      method: "GET",
      url: "/v1/identity/auth-events",
      headers: {
        authorization: `Bearer ${identitySessionSchema.parse(JSON.parse(relogin.body)).accessToken}`,
      },
    });
    expect(
      JSON.parse(events.body).events.some((event: { kind: string }) => event.kind === "reset"),
    ).toBe(true);
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
    expect(body.countryId).toBeNull();
    expect(body.countryLabel).toBeNull();
    expect(body.city).toBeNull();
    expect(body.showCity).toBe(false);
  });

  it("round-trips country, city, and showCity on PATCH identity/me", async () => {
    const session = await registerSession(app, "location@example.com");
    const fixture = await insertClubSeasonFixture();

    const patch = await app.inject({
      method: "PATCH",
      url: "/v1/identity/me",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
      payload: {
        countryId: fixture.countryId,
        city: "København",
        showCity: true,
      },
    });

    expect(patch.statusCode).toBe(200);
    const patched = identityMeSchema.parse(JSON.parse(patch.body));
    expect(patched.countryId).toBe(fixture.countryId);
    expect(patched.countryLabel).toBe("Danmark");
    expect(patched.city).toBe("København");
    expect(patched.showCity).toBe(true);

    const me = await app.inject({
      method: "GET",
      url: "/v1/identity/me",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
      },
    });

    expect(me.statusCode).toBe(200);
    const body = identityMeSchema.parse(JSON.parse(me.body));
    expect(body.countryId).toBe(fixture.countryId);
    expect(body.countryLabel).toBe("Danmark");
    expect(body.city).toBe("København");
    expect(body.showCity).toBe(true);
  });

  it("rejects unauthenticated location PATCH with 401", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/v1/identity/me",
      payload: {
        city: "København",
        showCity: true,
      },
    });

    expect(response.statusCode).toBe(401);
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
    expect(body.emailVerified).toBe(false);
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

  it("revokes the Auth session so the same Bearer is 401 on GET me", async () => {
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
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(me.statusCode).toBe(401);
  });

  it("rejects an old JWT on owner /v1 routes", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        sub: "550e8400-e29b-41d4-a716-446655440000",
        email: "old-jwt@example.com",
        role: "user",
      }),
    ).toString("base64url");
    const oldJwt = `${header}.${payload}.not-a-session`;

    const me = await app.inject({
      method: "GET",
      url: "/v1/identity/me",
      headers: { authorization: `Bearer ${oldJwt}` },
    });
    expect(me.statusCode).toBe(401);

    const jerseys = await app.inject({
      method: "GET",
      url: "/v1/collection/jerseys",
      headers: { authorization: `Bearer ${oldJwt}` },
    });
    expect(jerseys.statusCode).toBe(401);
  });

  it("logs in an existing bcrypt password without a force-reset", async () => {
    const passwordHash = await bcrypt.hash("legacy-pass-99", 12);
    const { db, pool } = createDb(DATABASE_URL);
    await db.insert(user).values({
      email: "legacy-bcrypt@example.com",
      passwordHash,
      name: "legacy_bcrypt",
      handle: "legacy_bcrypt",
    });
    await pool.end();

    const response = await app.inject({
      method: "POST",
      url: "/v1/identity/login",
      payload: {
        email: "legacy-bcrypt@example.com",
        password: "legacy-pass-99",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = identitySessionSchema.parse(JSON.parse(response.body));
    expect(body.user.email).toBe("legacy-bcrypt@example.com");
    expect(body.user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(body.accessToken.includes(".") && body.accessToken.split(".").length === 3).toBe(false);
  });

  it("persists login, logout, and failed login as Auth events", async () => {
    const registered = await registerSession(app, "events@example.com");

    const failed = await app.inject({
      method: "POST",
      url: "/v1/identity/login",
      payload: {
        email: "events@example.com",
        password: "wrong-password",
      },
    });
    expect(failed.statusCode).toBe(401);

    const loggedIn = await app.inject({
      method: "POST",
      url: "/v1/identity/login",
      payload: {
        email: "events@example.com",
        password: "password123",
      },
    });
    expect(loggedIn.statusCode).toBe(200);
    const session = identitySessionSchema.parse(JSON.parse(loggedIn.body));
    expect(session.user.id).toBe(registered.user.id);

    const listed = await app.inject({
      method: "GET",
      url: "/v1/identity/auth-events",
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(listed.statusCode).toBe(200);
    const events = authEventsSchema.parse(JSON.parse(listed.body));
    expect(events.events.map((event) => event.kind)).toEqual(
      expect.arrayContaining(["login", "failure"]),
    );

    const logout = await app.inject({
      method: "POST",
      url: "/v1/identity/logout",
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(logout.statusCode).toBe(204);

    const afterLogout = await app.inject({
      method: "GET",
      url: "/v1/identity/me",
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(afterLogout.statusCode).toBe(401);
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

  it("creates a first-time social User with a handle from the email local-part", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/identity/social",
      payload: {
        provider: "google",
        idToken: fixtureIdToken({
          provider: "google",
          verified: true,
          email: "social.first@example.com",
          providerUserId: "gid-first-1",
          displayName: "Provider Display Name",
        }),
      },
    });

    expect(response.statusCode).toBe(200);
    const body = identitySessionSchema.parse(JSON.parse(response.body));
    expect(body.user.email).toBe("social.first@example.com");
    expect(body.user.handle).toBe("social_first");
    expect(body.user.handle).not.toContain("Display");
    expect(body.user.fullName).toBeNull();
    expect(body.user.emailVerified).toBe(true);
    expect(body.user.linkedAccounts).toEqual([
      { provider: "google", linked: true },
      { provider: "facebook", linked: false },
    ]);
    const me = await app.inject({
      method: "GET",
      url: "/v1/identity/me",
      headers: { authorization: `Bearer ${body.accessToken}` },
    });
    expect(me.statusCode).toBe(200);
    expect(identityMeSchema.parse(JSON.parse(me.body)).linkedAccounts).toEqual(
      body.user.linkedAccounts,
    );
  });

  it("suffixes the handle when the email local-part is already taken", async () => {
    const existing = await registerSession(app, "social.collision@example.com");
    expect(existing.user.handle).toBe("social_collision");

    const response = await app.inject({
      method: "POST",
      url: "/v1/identity/social",
      payload: {
        provider: "facebook",
        idToken: fixtureIdToken({
          provider: "facebook",
          verified: true,
          email: "social.collision@other.com",
          providerUserId: "fid-collision-1",
        }),
      },
    });

    expect(response.statusCode).toBe(200);
    const body = identitySessionSchema.parse(JSON.parse(response.body));
    expect(body.user.id).not.toBe(existing.user.id);
    expect(body.user.handle).toBe("social_collision2");
    expect(body.user.linkedAccounts).toEqual([
      { provider: "google", linked: false },
      { provider: "facebook", linked: true },
    ]);
  });

  it("auto-links a verified social email to the existing User", async () => {
    const existing = await registerSession(app, "social.link@example.com");
    expect(existing.user.emailVerified).toBe(false);

    const response = await app.inject({
      method: "POST",
      url: "/v1/identity/social",
      payload: {
        provider: "google",
        idToken: fixtureIdToken({
          provider: "google",
          verified: true,
          email: "social.link@example.com",
          providerUserId: "gid-link-1",
        }),
      },
    });

    expect(response.statusCode).toBe(200);
    const body = identitySessionSchema.parse(JSON.parse(response.body));
    expect(body.user.id).toBe(existing.user.id);
    expect(body.user.handle).toBe(existing.user.handle);
    expect(body.user.emailVerified).toBe(true);
    expect(body.user.linkedAccounts).toEqual([
      { provider: "google", linked: true },
      { provider: "facebook", linked: false },
    ]);
    const me = await app.inject({
      method: "GET",
      url: "/v1/identity/me",
      headers: { authorization: `Bearer ${body.accessToken}` },
    });
    expect(identityMeSchema.parse(JSON.parse(me.body)).linkedAccounts).toEqual([
      { provider: "google", linked: true },
      { provider: "facebook", linked: false },
    ]);

    const login = await app.inject({
      method: "POST",
      url: "/v1/identity/login",
      payload: {
        email: "social.link@example.com",
        password: "password123",
      },
    });
    expect(login.statusCode).toBe(200);
    expect(identitySessionSchema.parse(JSON.parse(login.body)).user.linkedAccounts).toEqual([
      { provider: "google", linked: true },
      { provider: "facebook", linked: false },
    ]);

    const listed = await app.inject({
      method: "GET",
      url: "/v1/identity/auth-events",
      headers: { authorization: `Bearer ${body.accessToken}` },
    });
    expect(listed.statusCode).toBe(200);
    const events = authEventsSchema.parse(JSON.parse(listed.body));
    expect(events.events.map((event) => event.kind)).toEqual(
      expect.arrayContaining(["provider_link"]),
    );
    expect(
      events.events.some((event) => event.kind === "provider_link" && event.provider === "google"),
    ).toBe(true);
  });

  it("does not auto-link an unverified social email", async () => {
    const existing = await registerSession(app, "social.unverified@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/v1/identity/social",
      payload: {
        provider: "google",
        idToken: fixtureIdToken({
          provider: "google",
          verified: false,
          email: "social.unverified@example.com",
          providerUserId: "gid-unverified-1",
        }),
      },
    });

    expect(response.statusCode).toBe(401);

    const me = await app.inject({
      method: "GET",
      url: "/v1/identity/me",
      headers: { authorization: `Bearer ${existing.accessToken}` },
    });
    expect(identityMeSchema.parse(JSON.parse(me.body)).linkedAccounts).toEqual([
      { provider: "google", linked: false },
      { provider: "facebook", linked: false },
    ]);
  });

  it("rejects an invalid social idToken", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/identity/social",
      payload: {
        provider: "google",
        idToken: "not-a-fixture-token",
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it("does not create a User from an unverified social email", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/identity/social",
      payload: {
        provider: "facebook",
        idToken: fixtureIdToken({
          provider: "facebook",
          verified: false,
          email: "social.new-unverified@example.com",
          providerUserId: "fid-new-unverified-1",
        }),
      },
    });

    expect(response.statusCode).toBe(401);

    const created = await registerSession(app, "social.new-unverified@example.com");
    expect(created.user.email).toBe("social.new-unverified@example.com");
    expect(created.user.linkedAccounts).toEqual([
      { provider: "google", linked: false },
      { provider: "facebook", linked: false },
    ]);
  });

  it("does not offer Apple on the social contract", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/identity/social",
      payload: {
        provider: "apple",
        idToken: "test:apple:verified:apple@example.com:aid-1",
      },
    });

    expect(response.statusCode).toBe(400);
  });
});
