import "reflect-metadata";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { identitySessionSchema } from "@kit/api-contract";
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
  userJersey,
  userJerseyPhoto,
} from "@kit/db";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ADMIN_OBJECT_STORE } from "../dist/admin/admin-catalog.service.js";
import { AppModule } from "../dist/app.module.js";
import { OBJECT_STORE } from "../dist/collection/collection.service.js";
import { createMemoryObjectStore } from "../dist/collection/object-store.js";
import type { OutboundMail } from "../dist/notify/mailer.adapter.js";
import { MAILER } from "../dist/notify/mailer.token.js";
import { recordedMails, resetRecordedMails } from "../dist/notify/recording-mailer.adapter.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/db/migrations",
);

const DATABASE_URL =
  process.env.API_TEST_DATABASE_URL ?? "postgresql://kit:kit@localhost:5432/kit_api_test";

/** The one row an insert returned. */
function first<T>(rows: T[]): T {
  const [row] = rows;
  if (!row) {
    throw new Error("expected one inserted row");
  }
  return row;
}

const objectStore = createMemoryObjectStore();
const mailer = {
  failing: false,
  async send(mail: OutboundMail) {
    if (mailer.failing) {
      throw new Error("ses is down");
    }
    recordedMails.push(mail);
  },
};
const store = {
  failing: false,
  ...objectStore,
  deleteObject: async (key: string) => {
    if (store.failing) {
      throw new Error("simulated object-store failure");
    }
    return objectStore.deleteObject(key);
  },
};

describe("Admin take-down: jersey taken down mail (12)", () => {
  let app: NestFastifyApplication;
  let db: ReturnType<typeof createDb>["db"];
  let pool: ReturnType<typeof createDb>["pool"];
  let adminToken: string;
  let fixture: { clubId: string; seasonId: string };
  let counter = 0;

  async function register(email: string) {
    const response = await app.inject({
      method: "POST",
      url: "/v1/identity/register",
      payload: { email, password: "password123" },
    });
    return identitySessionSchema.parse(JSON.parse(response.body));
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.JWT_SECRET = "test-jwt-secret";
    process.env.EMAIL_SUPPORT_ADDRESS = "hjaelp@example.test";
    await resetDatabase(DATABASE_URL, migrationsFolder);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ADMIN_OBJECT_STORE)
      .useValue(store)
      .overrideProvider(OBJECT_STORE)
      .useValue(store)
      .overrideProvider(MAILER)
      .useValue(mailer)
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix("v1");
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    ({ db, pool } = createDb(DATABASE_URL));
    const dk = first(
      await db.insert(country).values({ iso3166: "DK" }).returning({ id: country.id }),
    );
    const lg = first(
      await db.insert(league).values({ countryId: dk.id }).returning({ id: league.id }),
    );
    const fc = first(
      await db.insert(club).values({ countryId: dk.id, kind: "club" }).returning({ id: club.id }),
    );
    await db.insert(catalogLabel).values({
      entityType: "club",
      entityId: fc.id,
      locale: "en",
      kind: "label",
      text: "FC Copenhagen",
      source: "seed",
    });
    const sn = first(
      await db
        .insert(season)
        .values({
          leagueId: lg.id,
          label: "2024/25",
          startsOn: "2024-07-01",
          endsOn: "2025-06-30",
          calendarKind: "split_year",
        })
        .returning({ id: season.id }),
    );
    await db.insert(teamSeason).values({ clubId: fc.id, seasonId: sn.id });
    fixture = { clubId: fc.id, seasonId: sn.id };

    await register("takedown-staff@example.com");
    await db
      .update(user)
      .set({ role: "admin" })
      .where(eq(user.email, "takedown-staff@example.com"));
    const login = await app.inject({
      method: "POST",
      url: "/v1/identity/login",
      payload: { email: "takedown-staff@example.com", password: "password123" },
    });
    adminToken = identitySessionSchema.parse(JSON.parse(login.body)).accessToken;
  });

  afterAll(async () => {
    await pool.end();
    await app.close();
  });

  beforeEach(() => {
    store.failing = false;
    mailer.failing = false;
  });

  /** An owner with one jersey and one stored photo. */
  async function ownerWithJersey() {
    counter += 1;
    const email = `takedown-owner-${counter}@example.com`;
    const owner = await register(email);
    const jersey = first(
      await db
        .insert(userJersey)
        .values({
          userId: owner.user.id,
          clubId: fixture.clubId,
          seasonId: fixture.seasonId,
          type: "away",
          size: "m",
          condition: "used",
        })
        .returning({ id: userJersey.id }),
    );
    const photoId = crypto.randomUUID();
    const key = `user/${owner.user.id}/${jersey.id}/${photoId}.jpg`;
    await objectStore.putObject(key, Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]));
    await db.insert(userJerseyPhoto).values({
      id: photoId,
      userJerseyId: jersey.id,
      objectKey: key,
      role: "front",
      source: "camera",
      ocrStatus: "none",
    });
    resetRecordedMails();
    return { email, userId: owner.user.id, jerseyId: jersey.id };
  }

  function takeDown(owner: { userId: string; jerseyId: string }, body?: unknown) {
    return app.inject({
      method: "DELETE",
      url: `/v1/admin/collectors/${owner.userId}/jerseys/${owner.jerseyId}`,
      headers: {
        authorization: `Bearer ${adminToken}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      payload: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async function jerseyRows(jerseyId: string) {
    return db.select({ id: userJersey.id }).from(userJersey).where(eq(userJersey.id, jerseyId));
  }

  it("mails the owner the club, type · season and the reason the operator gave", async () => {
    const owner = await ownerWithJersey();

    const response = await takeDown(owner, { reason: "Billedet viser en anden persons ansigt" });

    expect(response.statusCode).toBe(204);
    expect(await jerseyRows(owner.jerseyId)).toHaveLength(0);
    expect(recordedMails).toHaveLength(1);
    const mail = recordedMails[0];
    expect(mail?.to).toBe(owner.email);
    expect(mail?.subject).toBe("Din trøje er fjernet");
    for (const fact of [
      "FC Copenhagen",
      "Ude · 2024/25",
      "Årsag",
      "Billedet viser en anden persons ansigt",
    ]) {
      expect(mail?.text).toContain(fact);
    }
    // The footer prints the support address in every mail; the Note must name it above the footer.
    const aboveFooter = mail?.text.slice(0, mail.text.lastIndexOf("\n\n"));
    expect(aboveFooter).toContain("hjaelp@example.test");
  });

  it("takes the jersey down and shows a flagged gap when the operator gave no reason", async () => {
    const owner = await ownerWithJersey();

    const response = await takeDown(owner);

    expect(response.statusCode).toBe(204);
    expect(await jerseyRows(owner.jerseyId)).toHaveLength(0);
    expect(recordedMails).toHaveLength(1);
    expect(recordedMails[0]?.text).toContain("[MANGLER: årsag]");
  });

  it("sends the mail whatever the owner's e-mail switches say", async () => {
    const owner = await ownerWithJersey();
    const login = await app.inject({
      method: "POST",
      url: "/v1/identity/login",
      payload: { email: owner.email, password: "password123" },
    });
    const token = identitySessionSchema.parse(JSON.parse(login.body)).accessToken;
    await app.inject({
      method: "PATCH",
      url: "/v1/identity/notification-prefs",
      headers: { authorization: `Bearer ${token}` },
      payload: { email: { bidsAndMessages: false, wishMatches: false } },
    });

    await takeDown(owner, { reason: "Regelbrud" });

    expect(recordedMails.map((mail) => mail.subject)).toEqual(["Din trøje er fjernet"]);
  });

  it("answers 400 to a reason that is not text, and takes nothing down", async () => {
    const owner = await ownerWithJersey();

    const response = await takeDown(owner, { reason: 42 });

    expect(response.statusCode).toBe(400);
    expect(await jerseyRows(owner.jerseyId)).toHaveLength(1);
    expect(recordedMails).toHaveLength(0);
  });

  it("sends nothing for a jersey that does not exist", async () => {
    const owner = await ownerWithJersey();

    const response = await takeDown({ userId: owner.userId, jerseyId: crypto.randomUUID() });

    expect(response.statusCode).toBe(404);
    expect(recordedMails).toHaveLength(0);
  });

  it("sends nothing when the photo delete fails and the jersey stays", async () => {
    const owner = await ownerWithJersey();
    store.failing = true;

    const response = await takeDown(owner, { reason: "Regelbrud" });

    expect(response.statusCode).toBe(500);
    expect(await jerseyRows(owner.jerseyId)).toHaveLength(1);
    expect(recordedMails).toHaveLength(0);
  });

  it("still answers 204 and removes the jersey when the mailer throws", async () => {
    const owner = await ownerWithJersey();
    mailer.failing = true;

    const response = await takeDown(owner, { reason: "Regelbrud" });

    expect(response.statusCode).toBe(204);
    expect(await jerseyRows(owner.jerseyId)).toHaveLength(0);
  });
});
