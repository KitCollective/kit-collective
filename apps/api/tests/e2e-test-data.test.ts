import "reflect-metadata";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { identitySessionSchema } from "@kit/api-contract";
import {
  catalogLabel,
  collectionShortcut,
  conversation,
  conversationMessage,
  conversationParticipant,
  createDb,
  type Db,
  entitlement,
  resetDatabase,
  teamSeason,
  user,
  userJersey,
  userJerseyFavorite,
  userJerseyPhoto,
  wishlistEntry,
} from "@kit/db";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { asc, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../dist/app.module.js";
import { createMemoryObjectStore } from "../dist/collection/object-store.js";
import { insertLocalFixtureCatalog } from "../dist/e2e/local-catalog.js";
import {
  TEST_COLLECTOR_ID,
  TEST_DATA_CATALOG,
  TEST_PEER_ID,
} from "../dist/e2e/test-data.fixture.js";
import { applyTestData } from "../dist/e2e/test-data.js";
import { assertTestDataDatabaseAllowed } from "../dist/e2e/test-data-guard.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/db/migrations",
);

const DATABASE_URL =
  process.env.API_TEST_DATABASE_URL ?? "postgresql://kit:kit@localhost:5432/kit_api_test";

const CREDENTIALS = {
  collector: { email: "e2e-collector@test.kitcollective", password: "collector-pass-1" },
  peer: { email: "e2e-peer@test.kitcollective", password: "peer-pass-1" },
};

const BYSTANDER_ID = "0b57a4de-0000-4000-8000-000000000001";

/** A Collector the command must never touch, with one row of every kind it resets. */
async function insertBystander(db: Db): Promise<void> {
  await db.insert(user).values({
    id: BYSTANDER_ID,
    email: "bystander@test.kitcollective",
    passwordHash: "hash",
    handle: "bystander",
    name: "bystander",
  });
  const [side] = await db.select().from(teamSeason).limit(1);
  const [jersey] = await db
    .insert(userJersey)
    .values({
      userId: BYSTANDER_ID,
      clubId: side!.clubId,
      seasonId: side!.seasonId,
      type: "home",
      size: "m",
      condition: "used",
    })
    .returning({ id: userJersey.id });
  await db.insert(userJerseyPhoto).values({
    userJerseyId: jersey!.id,
    objectKey: `user/${BYSTANDER_ID}/${jersey!.id}/p/grid.jpg`,
    role: "front",
    source: "gallery",
  });
  await db.insert(wishlistEntry).values({ userId: BYSTANDER_ID, clubId: side!.clubId });
  await db.insert(entitlement).values({ userId: BYSTANDER_ID, source: null, trialUsed: true });
  await db
    .insert(collectionShortcut)
    .values({ userId: BYSTANDER_ID, name: "Mine", clubId: side!.clubId });
}

async function snapshot(db: Db, userIds: string[]) {
  const jerseys = await db
    .select()
    .from(userJersey)
    .where(inArray(userJersey.userId, userIds))
    .orderBy(asc(userJersey.id));
  const jerseyIds = jerseys.map((row) => row.id);
  return {
    users: await db.select().from(user).where(inArray(user.id, userIds)).orderBy(asc(user.id)),
    jerseys,
    photos: jerseyIds.length
      ? await db
          .select()
          .from(userJerseyPhoto)
          .where(inArray(userJerseyPhoto.userJerseyId, jerseyIds))
          .orderBy(asc(userJerseyPhoto.id))
      : [],
    wishlist: await db
      .select()
      .from(wishlistEntry)
      .where(inArray(wishlistEntry.userId, userIds))
      .orderBy(asc(wishlistEntry.id)),
    entitlements: await db
      .select()
      .from(entitlement)
      .where(inArray(entitlement.userId, userIds))
      .orderBy(asc(entitlement.userId)),
    shortcuts: await db
      .select()
      .from(collectionShortcut)
      .where(inArray(collectionShortcut.userId, userIds))
      .orderBy(asc(collectionShortcut.id)),
  };
}

const SNAPSHOT_KEYS = [
  "users",
  "jerseys",
  "photos",
  "wishlist",
  "entitlements",
  "shortcuts",
] as const;

/** Row identity and content without the fields a re-run refreshes. */
function stable(rows: Array<Record<string, unknown>>) {
  return rows.map(({ createdAt: _c, updatedAt: _u, passwordHash: _p, ...rest }) => rest);
}

describe("device-flow test data", () => {
  let db: Db;
  let closePool: () => Promise<void>;
  const objectStore = createMemoryObjectStore();

  beforeAll(() => {
    const created = createDb(DATABASE_URL);
    db = created.db;
    closePool = () => created.pool.end();
  });

  afterAll(async () => {
    await closePool();
  });

  beforeEach(async () => {
    await resetDatabase(DATABASE_URL, migrationsFolder);
    await insertLocalFixtureCatalog(db);
    await insertBystander(db);
  });

  it("puts the two test Collectors into the known state", async () => {
    await applyTestData({ db, objectStore, credentials: CREDENTIALS });

    const own = await db.select().from(userJersey).where(eq(userJersey.userId, TEST_COLLECTOR_ID));
    expect(own).toHaveLength(4);
    expect(own.filter((row) => row.clubId !== null)).toHaveLength(3);
    expect(own.filter((row) => row.nationalTeamId !== null)).toHaveLength(1);
    expect(own.filter((row) => row.private)).toHaveLength(1);
    expect(own.filter((row) => row.biddingEnabled)).toHaveLength(0);

    const peerJerseys = await db
      .select()
      .from(userJersey)
      .where(eq(userJersey.userId, TEST_PEER_ID));
    expect(peerJerseys).toHaveLength(1);
    expect(peerJerseys[0]).toMatchObject({ private: false, biddingEnabled: true });

    const photos = await db
      .select()
      .from(userJerseyPhoto)
      .where(
        inArray(
          userJerseyPhoto.userJerseyId,
          [...own, ...peerJerseys].map((row) => row.id),
        ),
      );
    expect(photos.length).toBeGreaterThanOrEqual(5);
    for (const photo of photos) {
      expect(await objectStore.objectExists(photo.objectKey)).toBe(true);
    }

    expect(
      await db.select().from(wishlistEntry).where(eq(wishlistEntry.userId, TEST_COLLECTOR_ID)),
    ).toHaveLength(1);

    const [comp] = await db
      .select()
      .from(entitlement)
      .where(eq(entitlement.userId, TEST_COLLECTOR_ID));
    expect(comp?.source).toBe("comp");
    expect(comp!.expires!.getTime()).toBeGreaterThan(Date.now());

    // The peer has no live Entitlement and a spent trial, so the paywall Sheet shows.
    const [peerEntitlement] = await db
      .select()
      .from(entitlement)
      .where(eq(entitlement.userId, TEST_PEER_ID));
    expect(peerEntitlement).toMatchObject({ source: null, trialUsed: true });
  });

  it("is idempotent: a second run leaves the same rows", async () => {
    await applyTestData({ db, objectStore, credentials: CREDENTIALS });
    const first = await snapshot(db, [TEST_COLLECTOR_ID, TEST_PEER_ID]);
    await applyTestData({ db, objectStore, credentials: CREDENTIALS });
    const second = await snapshot(db, [TEST_COLLECTOR_ID, TEST_PEER_ID]);

    for (const key of SNAPSHOT_KEYS) {
      expect(stable(second[key])).toEqual(stable(first[key]));
    }
  });

  it("removes what a flow run left behind", async () => {
    await applyTestData({ db, objectStore, credentials: CREDENTIALS });
    const before = await snapshot(db, [TEST_COLLECTOR_ID, TEST_PEER_ID]);

    // What the flows leave behind (an added UserJersey, a bid thread), plus stray rows no flow
    // writes today (a favourite, a new Ønske), so the reset is proven against more than it needs.
    const [side] = await db.select().from(teamSeason).limit(1);
    const [added] = await db
      .insert(userJersey)
      .values({
        userId: TEST_COLLECTOR_ID,
        clubId: side!.clubId,
        seasonId: side!.seasonId,
        type: "home",
        size: "m",
        condition: "used",
      })
      .returning({ id: userJersey.id });
    await db.insert(userJerseyPhoto).values({
      userJerseyId: added!.id,
      objectKey: `user/${TEST_COLLECTOR_ID}/${added!.id}/p/grid.jpg`,
      role: "front",
      source: "gallery",
    });
    await db
      .insert(userJerseyFavorite)
      .values({ collectorId: BYSTANDER_ID, userJerseyId: added!.id });
    const [peerJersey] = await db
      .select()
      .from(userJersey)
      .where(eq(userJersey.userId, TEST_PEER_ID));
    const [lower, upper] = [TEST_COLLECTOR_ID, TEST_PEER_ID].sort();
    const [thread] = await db
      .insert(conversation)
      .values({ userJerseyId: peerJersey!.id, lowerCollectorId: lower!, upperCollectorId: upper! })
      .returning({ id: conversation.id });
    await db.insert(conversationParticipant).values([
      { conversationId: thread!.id, userId: TEST_COLLECTOR_ID },
      { conversationId: thread!.id, userId: TEST_PEER_ID },
    ]);
    await db.insert(conversationMessage).values({
      conversationId: thread!.id,
      senderId: TEST_COLLECTOR_ID,
      kind: "bid",
      bidAmountDkk: 250,
      bidStatus: "pending",
    });
    await db.insert(wishlistEntry).values({ userId: TEST_COLLECTOR_ID, type: "away" });
    await db
      .update(userJersey)
      .set({ private: true, biddingEnabled: false })
      .where(eq(userJersey.id, peerJersey!.id));

    await applyTestData({ db, objectStore, credentials: CREDENTIALS });
    const after = await snapshot(db, [TEST_COLLECTOR_ID, TEST_PEER_ID]);

    for (const key of SNAPSHOT_KEYS) {
      expect(stable(after[key])).toEqual(stable(before[key]));
    }
    expect(await db.select().from(conversation)).toHaveLength(0);
    expect(await db.select().from(conversationMessage)).toHaveLength(0);
  });

  it("changes only the two test Collectors", async () => {
    const before = await snapshot(db, [BYSTANDER_ID]);
    await applyTestData({ db, objectStore, credentials: CREDENTIALS });
    await applyTestData({ db, objectStore, credentials: CREDENTIALS });
    expect(await snapshot(db, [BYSTANDER_ID])).toEqual(before);
    expect(await db.select({ id: user.id }).from(user)).toHaveLength(3);
  });

  it("refuses when the test Collector's e-mail belongs to another Collector", async () => {
    await db.insert(user).values({
      email: CREDENTIALS.collector.email,
      passwordHash: "hash",
      handle: "someone-real",
      name: "someone-real",
    });
    await expect(applyTestData({ db, objectStore, credentials: CREDENTIALS })).rejects.toThrow(
      /belongs to another Collector/,
    );
    expect(await db.select().from(userJersey).where(eq(userJersey.userId, TEST_PEER_ID))).toEqual(
      [],
    );
  });

  it("fails without writing when a catalog side is missing", async () => {
    await db.delete(catalogLabel).where(eq(catalogLabel.text, TEST_DATA_CATALOG.nationalTeams[0]!));
    await expect(applyTestData({ db, objectStore, credentials: CREDENTIALS })).rejects.toThrow(
      new RegExp(TEST_DATA_CATALOG.nationalTeams[0]!),
    );
    expect(await db.select({ id: user.id }).from(user)).toHaveLength(1);
  });

  it("lets the test Collector sign in with the configured credentials", async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    delete process.env.R2_ENDPOINT;
    await applyTestData({ db, objectStore, credentials: CREDENTIALS });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix("v1");
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    try {
      const response = await app.inject({
        method: "POST",
        url: "/v1/identity/login",
        payload: CREDENTIALS.collector,
      });
      expect(response.statusCode).toBeLessThan(300);
      const session = identitySessionSchema.parse(JSON.parse(response.body));
      expect(session.user.id).toBe(TEST_COLLECTOR_ID);
    } finally {
      await app.close();
    }
  });
});

describe("device-flow test data database guard", () => {
  const staging = "postgresql://kit:secret@203.0.113.7:5432/kitcollective?sslmode=require";

  it("refuses when no target is declared", () => {
    expect(() => assertTestDataDatabaseAllowed({ databaseUrl: staging })).toThrow(
      /E2E_TEST_DATA_TARGET/,
    );
  });

  it("refuses production as the target", () => {
    expect(() =>
      assertTestDataDatabaseAllowed({ databaseUrl: staging, target: "production" }),
    ).toThrow(/production/);
  });

  it("refuses a URL that is the production database, whatever target is declared", () => {
    expect(() =>
      assertTestDataDatabaseAllowed({
        databaseUrl: staging,
        target: "staging",
        productionDatabaseUrl: "postgres://other:pw@203.0.113.7:5432/kitcollective",
      }),
    ).toThrow(/production/);
  });

  it("refuses a URL that names production in its host or database", () => {
    for (const databaseUrl of [
      "postgresql://kit:pw@db.production.internal:5432/kitcollective?sslmode=require",
      "postgresql://kit:pw@203.0.113.9:5432/kc_prod?sslmode=require",
    ]) {
      expect(() => assertTestDataDatabaseAllowed({ databaseUrl, target: "staging" })).toThrow(
        /production/,
      );
    }
  });

  it("refuses on a production process, whatever target is declared", () => {
    expect(() =>
      assertTestDataDatabaseAllowed({
        databaseUrl: staging,
        target: "staging",
        nodeEnv: "production",
      }),
    ).toThrow(/production/);
  });

  it("allows staging, and a local test database", () => {
    expect(() =>
      assertTestDataDatabaseAllowed({
        databaseUrl: staging,
        target: "staging",
        productionDatabaseUrl: "postgresql://kit:pw@203.0.113.99:5432/kitcollective",
      }),
    ).not.toThrow();
    expect(() =>
      assertTestDataDatabaseAllowed({ databaseUrl: DATABASE_URL, target: "local" }),
    ).not.toThrow();
  });
});
