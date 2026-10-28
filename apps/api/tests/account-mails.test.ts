import "reflect-metadata";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { identityMeSchema, identitySessionSchema } from "@kit/api-contract";
import { createDb, resetDatabase, user } from "@kit/db";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../dist/app.module.js";
import type { OutboundMail } from "../dist/notify/mailer.adapter.js";
import { MAILER } from "../dist/notify/mailer.token.js";
import { recordedMails, resetRecordedMails } from "../dist/notify/recording-mailer.adapter.js";
import { clearAuthThrottleHits } from "./helpers/auth-throttle.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/db/migrations",
);

const DATABASE_URL =
  process.env.API_TEST_DATABASE_URL ?? "postgresql://kit:kit@localhost:5432/kit_api_test";

/** Records like the test mailer, but throws on demand for every mail that is not a code mail. */
const mailer = {
  failing: false,
  async send(mail: OutboundMail) {
    if (mailer.failing && !/^\d{6} /.test(mail.subject)) {
      throw new Error("ses is down");
    }
    recordedMails.push(mail);
  },
};

function latestCode(email: string): string {
  const mail = [...recordedMails]
    .reverse()
    .find((item) => item.to === email && /^\d{6} /.test(item.subject));
  if (!mail) {
    throw new Error(`No code was mailed to ${email}`);
  }
  return mail.subject.slice(0, 6);
}

describe("Account mails over HTTP: e-mail changed (03) and account deleted (04)", () => {
  let app: NestFastifyApplication;
  let helperDb: ReturnType<typeof createDb>;

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.JWT_SECRET = "test-jwt-secret";
    process.env.BETTER_AUTH_SECRET = "test-better-auth-secret-not-for-production";
    process.env.BETTER_AUTH_URL = "http://127.0.0.1:3000";
    process.env.EMAIL_SUPPORT_ADDRESS = "hjaelp@example.test";
    delete process.env.R2_ENDPOINT;
    await resetDatabase(DATABASE_URL, migrationsFolder);
    helperDb = createDb(DATABASE_URL);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MAILER)
      .useValue(mailer)
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix("v1");
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await helperDb.pool.end();
    await app.close();
  });

  beforeEach(async () => {
    mailer.failing = false;
    resetRecordedMails();
    await clearAuthThrottleHits();
  });

  async function signUpByCode(email: string) {
    await app.inject({ method: "POST", url: "/v1/identity/code", payload: { email } });
    const verify = await app.inject({
      method: "POST",
      url: "/v1/identity/code/verify",
      payload: { email, code: latestCode(email) },
    });
    expect(verify.statusCode).toBe(200);
    resetRecordedMails();
    return identitySessionSchema.parse(JSON.parse(verify.body));
  }

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  function requestChange(token: string, newEmail: string) {
    return app.inject({
      method: "POST",
      url: "/v1/identity/email/code",
      headers: auth(token),
      payload: { email: newEmail },
    });
  }

  function confirmChange(token: string, newEmail: string, code: string) {
    return app.inject({
      method: "POST",
      url: "/v1/identity/email/verify",
      headers: auth(token),
      payload: { email: newEmail, code },
    });
  }

  async function changeEmail(token: string, newEmail: string) {
    await requestChange(token, newEmail);
    return confirmChange(token, newEmail, latestCode(newEmail));
  }

  function deleteAccount(token: string) {
    return app.inject({ method: "DELETE", url: "/v1/identity/me", headers: auth(token) });
  }

  async function userRows(userId: string) {
    return helperDb.db.select({ id: user.id }).from(user).where(eq(user.id, userId));
  }

  it("sends 03 to the old address with the new one masked, after the code mail to the new one", async () => {
    const session = await signUpByCode("acct-old@example.com");

    const confirm = await changeEmail(session.accessToken, "acct-new@example.com");

    expect(confirm.statusCode).toBe(200);
    expect(recordedMails.map((mail) => mail.to)).toEqual([
      "acct-new@example.com",
      "acct-old@example.com",
    ]);
    const changed = recordedMails[1];
    expect(changed?.subject).toBe("Din e-mail er ændret");
    expect(changed?.text).toContain("Ny e-mail");
    expect(changed?.text).toContain("a•••@example.com");
    expect(changed?.text).not.toContain("acct-new@example.com");
  });

  it("sends no 03 on a wrong code", async () => {
    const session = await signUpByCode("acct-wrong@example.com");
    await requestChange(session.accessToken, "acct-wrong-new@example.com");
    const code = latestCode("acct-wrong-new@example.com");

    const wrong = await confirmChange(
      session.accessToken,
      "acct-wrong-new@example.com",
      code === "000000" ? "000001" : "000000",
    );

    expect(wrong.statusCode).toBe(401);
    expect(recordedMails.map((mail) => mail.to)).toEqual(["acct-wrong-new@example.com"]);
  });

  it("sends no 03 when the address belongs to another account", async () => {
    const session = await signUpByCode("acct-clash@example.com");
    await signUpByCode("acct-taken@example.com");

    const confirm = await changeEmail(session.accessToken, "acct-taken@example.com");

    expect(confirm.statusCode).toBe(409);
    expect(recordedMails.map((mail) => mail.to)).toEqual(["acct-taken@example.com"]);
  });

  it("still switches the address when the mailer throws on 03", async () => {
    const session = await signUpByCode("acct-fail-old@example.com");
    await requestChange(session.accessToken, "acct-fail-new@example.com");
    mailer.failing = true;

    const confirm = await confirmChange(
      session.accessToken,
      "acct-fail-new@example.com",
      latestCode("acct-fail-new@example.com"),
    );

    expect(confirm.statusCode).toBe(200);
    expect(identityMeSchema.parse(JSON.parse(confirm.body)).email).toBe(
      "acct-fail-new@example.com",
    );
  });

  it("sends 03 and 04 to a Collector who switched every e-mail off", async () => {
    const session = await signUpByCode("acct-off-old@example.com");
    const prefs = await app.inject({
      method: "PATCH",
      url: "/v1/identity/notification-prefs",
      headers: auth(session.accessToken),
      payload: { email: { bidsAndMessages: false, wishMatches: false } },
    });
    expect(prefs.statusCode).toBe(200);

    await changeEmail(session.accessToken, "acct-off-new@example.com");
    expect(recordedMails.map((mail) => mail.subject)).toContain("Din e-mail er ændret");

    resetRecordedMails();
    const del = await deleteAccount(session.accessToken);

    expect(del.statusCode).toBe(204);
    expect(recordedMails.map((mail) => [mail.to, mail.subject])).toEqual([
      ["acct-off-new@example.com", "Din konto er slettet"],
    ]);
  });

  it("sends 04 to the address the account had once the account is gone", async () => {
    const session = await signUpByCode("acct-delete@example.com");

    const del = await deleteAccount(session.accessToken);

    expect(del.statusCode).toBe(204);
    expect(await userRows(session.user.id)).toHaveLength(0);
    expect(recordedMails.map((mail) => [mail.to, mail.subject])).toEqual([
      ["acct-delete@example.com", "Din konto er slettet"],
    ]);
  });

  it("deletes the account and answers 204 when the mailer throws on 04", async () => {
    const session = await signUpByCode("acct-delete-fail@example.com");
    mailer.failing = true;

    const del = await deleteAccount(session.accessToken);

    expect(del.statusCode).toBe(204);
    expect(await userRows(session.user.id)).toHaveLength(0);
  });

  it("sends no 04 when there is no account to delete", async () => {
    const del = await app.inject({ method: "DELETE", url: "/v1/identity/me" });

    expect(del.statusCode).toBe(401);
    expect(recordedMails).toHaveLength(0);
  });
});
