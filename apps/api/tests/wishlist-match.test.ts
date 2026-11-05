import "reflect-metadata";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectionSaveResponseSchema,
  identitySessionSchema,
  WISHLIST_MATCH_CAP,
  wishlistEntriesSchema,
  wishlistEntrySchema,
  wishlistUnseenCountSchema,
} from "@kit/api-contract";
import {
  authThrottleHit,
  catalogLabel,
  club,
  country,
  createDb,
  entitlement,
  kit,
  league,
  resetDatabase,
  season,
  teamSeason,
  userJersey,
  wishlistMatch,
} from "@kit/db";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../dist/app.module.js";
import { MatchService } from "../dist/match/match.service.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/db/migrations",
);

const DATABASE_URL =
  process.env.API_TEST_DATABASE_URL ?? "postgresql://kit:kit@localhost:5432/kit_api_test";

const JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFwABAQEBAAAAAAAAAAAAAAAAAAUGB//EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//2Q==";

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
      "accept-language": "da",
    },
  });
  expect(response.statusCode).toBe(200);
}

type Fixture = {
  clubId: string;
  seasonId: string;
  clubLabelDa: string;
  seasonLabel: string;
  catalogKitId: string;
};

async function insertFixture(): Promise<Fixture> {
  const { db, pool } = createDb(DATABASE_URL);

  const [insertedCountry] = await db
    .insert(country)
    .values({ iso3166: "DK" })
    .returning({ id: country.id });
  if (!insertedCountry) {
    throw new Error("country insert failed");
  }

  const [insertedLeague] = await db
    .insert(league)
    .values({ countryId: insertedCountry.id })
    .returning({ id: league.id });
  if (!insertedLeague) {
    throw new Error("league insert failed");
  }

  const [insertedClub] = await db
    .insert(club)
    .values({ countryId: insertedCountry.id, kind: "club" })
    .returning({ id: club.id });
  if (!insertedClub) {
    throw new Error("club insert failed");
  }

  const seasonLabel = "2023/24";
  const [insertedSeason] = await db
    .insert(season)
    .values({
      leagueId: insertedLeague.id,
      label: seasonLabel,
      startsOn: "2023-07-01",
      endsOn: "2024-06-30",
      calendarKind: "split_year",
    })
    .returning({ id: season.id });
  if (!insertedSeason) {
    throw new Error("season insert failed");
  }

  await db.insert(teamSeason).values({
    clubId: insertedClub.id,
    seasonId: insertedSeason.id,
  });

  const [insertedKit] = await db
    .insert(kit)
    .values({
      clubId: insertedClub.id,
      seasonId: insertedSeason.id,
      type: "home",
    })
    .returning({ id: kit.id });
  if (!insertedKit) {
    throw new Error("kit insert failed");
  }

  const clubLabelDa = "F.C. København";
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
      text: clubLabelDa,
      source: "seed",
    },
  ]);

  await pool.end();

  return {
    clubId: insertedClub.id,
    seasonId: insertedSeason.id,
    clubLabelDa,
    seasonLabel,
    catalogKitId: insertedKit.id,
  };
}

async function saveJersey(
  app: NestFastifyApplication,
  accessToken: string,
  fixture: Fixture,
  options: { catalogKitId?: string | null; size?: string } = {},
) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/collection/jerseys/save",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "accept-language": "da",
    },
    payload: {
      clubId: fixture.clubId,
      seasonId: fixture.seasonId,
      type: "home",
      size: options.size ?? "m",
      condition: "used",
      catalogKitId: options.catalogKitId,
      photos: [{ role: "front", source: "gallery", contentBase64: JPEG_BASE64 }],
    },
  });

  expect(response.statusCode).toBe(201);
  return collectionSaveResponseSchema.parse(JSON.parse(response.body)).jersey;
}

async function patchPrivate(
  app: NestFastifyApplication,
  accessToken: string,
  jerseyId: string,
  value: boolean,
) {
  const response = await app.inject({
    method: "PATCH",
    url: `/v1/collection/jerseys/${jerseyId}/private`,
    headers: { authorization: `Bearer ${accessToken}` },
    payload: { private: value },
  });
  expect(response.statusCode).toBe(200);
}

function auth(accessToken: string) {
  return { authorization: `Bearer ${accessToken}`, "accept-language": "da" };
}

async function createWish(
  app: NestFastifyApplication,
  accessToken: string,
  payload: Record<string, unknown>,
) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/wishlist/entries",
    headers: auth(accessToken),
    payload,
  });
  expect(response.statusCode).toBe(201);
  return wishlistEntrySchema.parse(JSON.parse(response.body));
}

async function listWishes(app: NestFastifyApplication, accessToken: string) {
  const response = await app.inject({
    method: "GET",
    url: "/v1/wishlist/entries",
    headers: auth(accessToken),
  });
  expect(response.statusCode).toBe(200);
  return wishlistEntriesSchema.parse(JSON.parse(response.body));
}

async function unseenCount(app: NestFastifyApplication, accessToken: string) {
  const response = await app.inject({
    method: "GET",
    url: "/v1/wishlist/matches/unseen-count",
    headers: auth(accessToken),
  });
  expect(response.statusCode).toBe(200);
  return wishlistUnseenCountSchema.parse(JSON.parse(response.body)).unseenCount;
}

async function setBidding(
  app: NestFastifyApplication,
  accessToken: string,
  jerseyId: string,
  biddingEnabled: boolean,
) {
  const response = await app.inject({
    method: "PATCH",
    url: `/v1/collection/jerseys/${jerseyId}/bidding`,
    headers: { authorization: `Bearer ${accessToken}` },
    payload: { biddingEnabled },
  });
  expect(response.statusCode).toBe(200);
}

async function saveOpenJersey(
  app: NestFastifyApplication,
  accessToken: string,
  fixture: Fixture,
  options: { size?: string } = {},
) {
  const jersey = await saveJersey(app, accessToken, fixture, options);
  await setBidding(app, accessToken, jersey.id, true);
  return jersey;
}

async function block(app: NestFastifyApplication, accessToken: string, peerId: string) {
  const response = await app.inject({
    method: "POST",
    url: `/v1/moderation/peers/${peerId}/block`,
    headers: { authorization: `Bearer ${accessToken}` },
  });
  expect(response.statusCode).toBe(201);
}

describe("Wishlist Match /v1", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.JWT_SECRET = "test-jwt-secret";
    delete process.env.R2_ENDPOINT;
    delete process.env.REDIS_URL;
    await prepareDatabase();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication(new FastifyAdapter());
    app.setGlobalPrefix("v1");
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  beforeEach(async () => {
    const { db, pool } = createDb(DATABASE_URL);
    await db.delete(authThrottleHit);
    await pool.end();
  });

  afterAll(async () => {
    await app.close();
    const { pool } = createDb(DATABASE_URL);
    await pool.end();
  });

  it("returns every Match of a wish, newest first, with Handle, thumb, found time and the totals", async () => {
    const fixture = await insertFixture();
    const watcher = await registerSession(app, "match-all-watcher@example.com");
    const peerA = await registerSession(app, "match-all-a@example.com");
    const peerB = await registerSession(app, "match-all-b@example.com");
    await startTrial(app, watcher.accessToken);
    await createWish(app, watcher.accessToken, { clubId: fixture.clubId, type: "home" });

    const first = await saveOpenJersey(app, peerA.accessToken, fixture);
    await listWishes(app, watcher.accessToken);
    const second = await saveOpenJersey(app, peerB.accessToken, fixture, { size: "l" });

    const listed = await listWishes(app, watcher.accessToken);
    const entry = listed.entries[0];
    expect(entry?.matchCount).toBe(2);
    expect(entry?.unseenCount).toBe(1);
    expect(listed.unseenCount).toBe(1);
    expect(entry?.matches.map((match) => match.jerseyId)).toEqual([second.id, first.id]);
    expect(entry?.matches.map((match) => match.ownerHandle)).toEqual([
      peerB.user.handle,
      peerA.user.handle,
    ]);
    expect(entry?.matches.map((match) => match.seen)).toEqual([false, true]);
    expect(entry?.matches[0]?.thumbUrl).toMatch(/^\/v1\/collection\/showcase\/photos\//);
    expect(Number.isNaN(Date.parse(entry?.matches[0]?.foundAt ?? ""))).toBe(false);
    expect(Date.parse(entry?.matches[0]?.foundAt ?? "")).toBeGreaterThan(
      Date.parse(entry?.matches[1]?.foundAt ?? ""),
    );
  });

  it("caps the Matches of a wish and still reports the total", async () => {
    const fixture = await insertFixture();
    const watcher = await registerSession(app, "match-cap-watcher@example.com");
    const peer = await registerSession(app, "match-cap-peer@example.com");
    await startTrial(app, watcher.accessToken);
    await createWish(app, watcher.accessToken, { clubId: fixture.clubId });

    const total = WISHLIST_MATCH_CAP + 2;
    for (let n = 0; n < total; n += 1) {
      await saveOpenJersey(app, peer.accessToken, fixture);
    }

    const listed = await listWishes(app, watcher.accessToken);
    expect(listed.entries[0]?.matches).toHaveLength(WISHLIST_MATCH_CAP);
    expect(listed.entries[0]?.matchCount).toBe(total);
    expect(listed.entries[0]?.unseenCount).toBe(total);
    expect(listed.unseenCount).toBe(total);
  });

  it("adds a Match when a peer opens a jersey for bids and drops it when it closes again", async () => {
    const fixture = await insertFixture();
    const watcher = await registerSession(app, "match-toggle-watcher@example.com");
    const peer = await registerSession(app, "match-toggle-peer@example.com");
    await startTrial(app, watcher.accessToken);
    await createWish(app, watcher.accessToken, { clubId: fixture.clubId, type: "home" });

    const jersey = await saveJersey(app, peer.accessToken, fixture);
    expect((await listWishes(app, watcher.accessToken)).entries[0]?.matchCount).toBe(0);

    await setBidding(app, peer.accessToken, jersey.id, true);
    const opened = await listWishes(app, watcher.accessToken);
    expect(opened.entries[0]?.matches.map((match) => match.jerseyId)).toEqual([jersey.id]);

    await setBidding(app, peer.accessToken, jersey.id, false);
    const closed = await listWishes(app, watcher.accessToken);
    expect(closed.entries[0]?.matchCount).toBe(0);
    expect(closed.entries[0]?.matches).toEqual([]);
  });

  it("drops a Match when the jersey goes private and when it is deleted", async () => {
    const fixture = await insertFixture();
    const watcher = await registerSession(app, "match-gone-watcher@example.com");
    const peer = await registerSession(app, "match-gone-peer@example.com");
    await startTrial(app, watcher.accessToken);
    await createWish(app, watcher.accessToken, { clubId: fixture.clubId });

    const privateJersey = await saveOpenJersey(app, peer.accessToken, fixture);
    const deletedJersey = await saveOpenJersey(app, peer.accessToken, fixture);
    expect((await listWishes(app, watcher.accessToken)).entries[0]?.matchCount).toBe(2);

    await patchPrivate(app, peer.accessToken, privateJersey.id, true);
    const afterPrivate = await listWishes(app, watcher.accessToken);
    expect(afterPrivate.entries[0]?.matches.map((match) => match.jerseyId)).toEqual([
      deletedJersey.id,
    ]);

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/v1/collection/jerseys/${deletedJersey.id}`,
      headers: { authorization: `Bearer ${peer.accessToken}` },
    });
    expect(deleteResponse.statusCode).toBeLessThan(300);
    const afterDelete = await listWishes(app, watcher.accessToken);
    expect(afterDelete.entries[0]?.matchCount).toBe(0);
    expect(afterDelete.unseenCount).toBe(0);
  });

  it("drops a Match when the owner blocks the Collector, and when the Collector blocks the owner", async () => {
    const fixture = await insertFixture();
    const watcher = await registerSession(app, "match-block-watcher@example.com");
    const blockedByOwner = await registerSession(app, "match-block-owner@example.com");
    const blockedByWatcher = await registerSession(app, "match-block-watcher-side@example.com");
    await startTrial(app, watcher.accessToken);
    await createWish(app, watcher.accessToken, { clubId: fixture.clubId });

    await saveOpenJersey(app, blockedByOwner.accessToken, fixture);
    await saveOpenJersey(app, blockedByWatcher.accessToken, fixture);
    expect((await listWishes(app, watcher.accessToken)).entries[0]?.matchCount).toBe(2);

    await block(app, blockedByOwner.accessToken, watcher.user.id);
    const afterOwnerBlock = await listWishes(app, watcher.accessToken);
    expect(afterOwnerBlock.entries[0]?.matches.map((match) => match.ownerHandle)).toEqual([
      blockedByWatcher.user.handle,
    ]);

    await block(app, watcher.accessToken, blockedByWatcher.user.id);
    expect((await listWishes(app, watcher.accessToken)).entries[0]?.matchCount).toBe(0);
  });

  it("never matches the Collector's own jerseys", async () => {
    const fixture = await insertFixture();
    const owner = await registerSession(app, "match-own-save@example.com");
    await startTrial(app, owner.accessToken);
    await createWish(app, owner.accessToken, { clubId: fixture.clubId, type: "home" });

    await saveOpenJersey(app, owner.accessToken, fixture);

    const listed = await listWishes(app, owner.accessToken);
    expect(listed.entries[0]?.matchCount).toBe(0);
    expect(await unseenCount(app, owner.accessToken)).toBe(0);
  });

  it("excludes closed copies and seed Kits linked on a UserJersey", async () => {
    const fixture = await insertFixture();
    const watcher = await registerSession(app, "match-excluded-watcher@example.com");
    const peer = await registerSession(app, "match-excluded-peer@example.com");
    await startTrial(app, watcher.accessToken);
    await createWish(app, watcher.accessToken, { clubId: fixture.clubId, type: "home" });

    await saveJersey(app, peer.accessToken, fixture);
    const seedJersey = await saveJersey(app, peer.accessToken, fixture, {
      catalogKitId: fixture.catalogKitId,
    });
    await setBidding(app, peer.accessToken, seedJersey.id, true);

    expect((await listWishes(app, watcher.accessToken)).entries[0]?.matchCount).toBe(0);
  });

  it("marks the returned Matches seen after the list responds, so the badge goes from n to 0", async () => {
    const fixture = await insertFixture();
    const watcher = await registerSession(app, "match-seen-watcher@example.com");
    const peer = await registerSession(app, "match-seen-peer@example.com");
    await startTrial(app, watcher.accessToken);
    await createWish(app, watcher.accessToken, { clubId: fixture.clubId });
    await saveOpenJersey(app, peer.accessToken, fixture);
    await saveOpenJersey(app, peer.accessToken, fixture);

    expect(await unseenCount(app, watcher.accessToken)).toBe(2);

    const first = await listWishes(app, watcher.accessToken);
    expect(first.entries[0]?.matches.map((match) => match.seen)).toEqual([false, false]);
    expect(first.entries[0]?.unseenCount).toBe(2);
    expect(first.unseenCount).toBe(2);

    const second = await listWishes(app, watcher.accessToken);
    expect(second.entries[0]?.matches.map((match) => match.seen)).toEqual([true, true]);
    expect(second.entries[0]?.unseenCount).toBe(0);
    expect(second.unseenCount).toBe(0);
    expect(await unseenCount(app, watcher.accessToken)).toBe(0);
  });

  it("never marks anything seen on the badge request alone", async () => {
    const fixture = await insertFixture();
    const watcher = await registerSession(app, "match-badge-watcher@example.com");
    const peer = await registerSession(app, "match-badge-peer@example.com");
    await startTrial(app, watcher.accessToken);
    await createWish(app, watcher.accessToken, { clubId: fixture.clubId });
    await saveOpenJersey(app, peer.accessToken, fixture);

    expect(await unseenCount(app, watcher.accessToken)).toBe(1);
    expect(await unseenCount(app, watcher.accessToken)).toBe(1);

    const listed = await listWishes(app, watcher.accessToken);
    expect(listed.entries[0]?.matches[0]?.seen).toBe(false);
  });

  it("requires a session for the badge request", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/wishlist/matches/unseen-count",
    });
    expect(response.statusCode).toBe(401);
  });

  it("recomputes the Matches of an edited wish and returns them unseen", async () => {
    const fixture = await insertFixture();
    const watcher = await registerSession(app, "match-edit-watcher@example.com");
    const peer = await registerSession(app, "match-edit-peer@example.com");
    await startTrial(app, watcher.accessToken);
    const wish = await createWish(app, watcher.accessToken, {
      clubId: fixture.clubId,
      size: "m",
    });
    await saveOpenJersey(app, peer.accessToken, fixture, { size: "m" });
    const large = await saveOpenJersey(app, peer.accessToken, fixture, { size: "l" });
    expect((await listWishes(app, watcher.accessToken)).entries[0]?.matchCount).toBe(1);

    const patchResponse = await app.inject({
      method: "PATCH",
      url: `/v1/wishlist/entries/${wish.id}`,
      headers: auth(watcher.accessToken),
      payload: { clubId: fixture.clubId, size: "l" },
    });
    expect(patchResponse.statusCode).toBe(200);
    const updated = wishlistEntrySchema.parse(JSON.parse(patchResponse.body));
    expect(updated.matches.map((match) => match.jerseyId)).toEqual([large.id]);
    expect(updated.matches[0]?.seen).toBe(false);
    expect(await unseenCount(app, watcher.accessToken)).toBe(1);
  });

  it("shows a new wish its existing Matches without marking them seen", async () => {
    const fixture = await insertFixture();
    const watcher = await registerSession(app, "match-create-watcher@example.com");
    const peer = await registerSession(app, "match-create-peer@example.com");
    await startTrial(app, watcher.accessToken);
    const jersey = await saveOpenJersey(app, peer.accessToken, fixture);

    const created = await createWish(app, watcher.accessToken, { clubId: fixture.clubId });

    expect(created.matches.map((match) => match.jerseyId)).toEqual([jersey.id]);
    expect(created.unseenCount).toBe(1);
    expect(await unseenCount(app, watcher.accessToken)).toBe(1);
  });

  it("keeps the rows but shows no Matches and a zero badge after the entitlement lapses", async () => {
    const fixture = await insertFixture();
    const watcher = await registerSession(app, "match-lapse@example.com");
    const peer = await registerSession(app, "match-lapse-peer@example.com");
    await startTrial(app, watcher.accessToken);
    const created = await createWish(app, watcher.accessToken, { clubId: fixture.clubId });
    await saveOpenJersey(app, peer.accessToken, fixture);
    expect(await unseenCount(app, watcher.accessToken)).toBe(1);

    const { db, pool } = createDb(DATABASE_URL);
    await db.delete(entitlement).where(eq(entitlement.userId, watcher.user.id));
    await pool.end();

    const listed = await listWishes(app, watcher.accessToken);
    expect(listed.entries).toHaveLength(1);
    expect(listed.entries[0]?.id).toBe(created.id);
    expect(listed.entries[0]?.matches).toEqual([]);
    expect(listed.entries[0]?.matchCount).toBe(0);
    expect(listed.unseenCount).toBe(0);
    expect(await unseenCount(app, watcher.accessToken)).toBe(0);
  });

  it("does not expose another collector's Matches", async () => {
    const fixture = await insertFixture();
    const owner = await registerSession(app, "match-owner@example.com");
    const stranger = await registerSession(app, "match-stranger@example.com");
    const peer = await registerSession(app, "match-owner-peer@example.com");
    await startTrial(app, owner.accessToken);
    await createWish(app, owner.accessToken, { clubId: fixture.clubId });
    await saveOpenJersey(app, peer.accessToken, fixture);

    const strangerList = await listWishes(app, stranger.accessToken);
    expect(strangerList.entries).toHaveLength(0);
    expect(strangerList.unseenCount).toBe(0);
    expect(await unseenCount(app, stranger.accessToken)).toBe(0);
  });

  it("stores the Matches of a saved jersey that is already open for bids", async () => {
    const fixture = await insertFixture();
    const watcher = await registerSession(app, "match-save-watcher@example.com");
    const saver = await registerSession(app, "match-save-saver@example.com");
    await startTrial(app, watcher.accessToken);
    const wish = await createWish(app, watcher.accessToken, { clubId: fixture.clubId });

    const jersey = await saveJersey(app, saver.accessToken, fixture);
    const { db, pool } = createDb(DATABASE_URL);
    await db.update(userJersey).set({ biddingEnabled: true }).where(eq(userJersey.id, jersey.id));

    await app
      .get(MatchService, { strict: false })
      .processSaveMatchJob({ savedUserJerseyId: jersey.id, saverUserId: saver.user.id });

    const rows = await db
      .select({ userJerseyId: wishlistMatch.userJerseyId, seen: wishlistMatch.seen })
      .from(wishlistMatch)
      .where(eq(wishlistMatch.wishlistEntryId, wish.id));
    await pool.end();
    expect(rows).toEqual([{ userJerseyId: jersey.id, seen: false }]);
  });

  it("carries over every pair the rule gives today as unseen, and nothing else", async () => {
    const fixture = await insertFixture();
    const watcher = await registerSession(app, "match-migrate-watcher@example.com");
    const open = await registerSession(app, "match-migrate-open@example.com");
    const closed = await registerSession(app, "match-migrate-closed@example.com");
    const hidden = await registerSession(app, "match-migrate-private@example.com");
    const blocked = await registerSession(app, "match-migrate-blocked@example.com");
    await startTrial(app, watcher.accessToken);
    const wish = await createWish(app, watcher.accessToken, { clubId: fixture.clubId });

    const matching = await saveOpenJersey(app, open.accessToken, fixture);
    await saveJersey(app, closed.accessToken, fixture);
    const privateJersey = await saveOpenJersey(app, hidden.accessToken, fixture);
    await patchPrivate(app, hidden.accessToken, privateJersey.id, true);
    await saveOpenJersey(app, blocked.accessToken, fixture);
    await block(app, blocked.accessToken, watcher.user.id);
    await saveOpenJersey(app, watcher.accessToken, fixture);

    const { db, pool } = createDb(DATABASE_URL);
    await db.execute(sql`DELETE FROM wishlist_match`);
    const migrationSql = readFileSync(
      path.join(migrationsFolder, "0041_wishlist_match.sql"),
      "utf8",
    );
    for (const statement of migrationSql.split("--> statement-breakpoint")) {
      await db.execute(sql.raw(statement));
    }
    const rows = await db
      .select({
        userJerseyId: wishlistMatch.userJerseyId,
        wishlistEntryId: wishlistMatch.wishlistEntryId,
        seen: wishlistMatch.seen,
      })
      .from(wishlistMatch)
      .where(eq(wishlistMatch.wishlistEntryId, wish.id));
    await pool.end();

    expect(rows).toEqual([{ userJerseyId: matching.id, wishlistEntryId: wish.id, seen: false }]);
  });
});
