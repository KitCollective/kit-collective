import "reflect-metadata";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  identityCodeAcceptedSchema,
  identityMeSchema,
  identitySessionSchema,
} from "@kit/api-contract";
import { createDb, resetDatabase, user, verification } from "@kit/db";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../dist/app.module.js";
import { recordedMails, resetRecordedMails } from "../dist/notify/recording-mailer.adapter.js";
import { clearAuthThrottleHits } from "./helpers/auth-throttle.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/db/migrations",
);

const DATABASE_URL =
  process.env.API_TEST_DATABASE_URL ?? "postgresql://kit:kit@localhost:5432/kit_api_test";

/** The six digits that lead the subject of the newest mail sent to this address. */
function latestCode(email: string): string {
  const mail = [...recordedMails]
    .reverse()
    .find((item) => item.to === email && /^\d{6} /.test(item.subject));
  if (!mail) {
    throw new Error(`No code was mailed to ${email}`);
  }
  return mail.subject.slice(0, 6);
}

function wrongCodeFor(code: string): string {
  return code === "000000" ? "000001" : "000000";
}

describe("Identity /v1 e-mail change by code", () => {
  let app: NestFastifyApplication;
  let helperDb: ReturnType<typeof createDb>;

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.JWT_SECRET = "test-jwt-secret";
    process.env.BETTER_AUTH_SECRET = "test-better-auth-secret-not-for-production";
    process.env.BETTER_AUTH_URL = "http://127.0.0.1:3000";
    delete process.env.R2_ENDPOINT;
    await resetDatabase(DATABASE_URL, migrationsFolder);
    helperDb = createDb(DATABASE_URL);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
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
    resetRecordedMails();
    await clearAuthThrottleHits();
  });

  /** A collector who signed up with an e-mail code and never had a password. */
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

  function requestChange(token: string | null, email: string, remoteAddress?: string) {
    return app.inject({
      method: "POST",
      url: "/v1/identity/email/code",
      remoteAddress,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      payload: { email },
    });
  }

  function confirmChange(token: string | null, email: string, code: string) {
    return app.inject({
      method: "POST",
      url: "/v1/identity/email/verify",
      headers: token ? { authorization: `Bearer ${token}` } : {},
      payload: { email, code },
    });
  }

  function getMe(token: string) {
    return app.inject({
      method: "GET",
      url: "/v1/identity/me",
      headers: { authorization: `Bearer ${token}` },
    });
  }

  it("mails the code to the new address only, on the confirm-new-e-mail subject", async () => {
    const session = await signUpByCode("change-old@example.com");

    const response = await requestChange(session.accessToken, "change-new@example.com");

    expect(response.statusCode).toBe(200);
    expect(identityCodeAcceptedSchema.parse(JSON.parse(response.body))).toEqual({ accepted: true });
    expect(recordedMails.map((mail) => mail.to)).toEqual(["change-new@example.com"]);
    expect(recordedMails[0]?.subject).toMatch(/^\d{6} bekræfter din nye e-mail$/);
  });

  it("switches the address and marks it verified on the correct code, for an account with no password", async () => {
    const session = await signUpByCode("change-nopw@example.com");
    await requestChange(session.accessToken, "Change-NoPw-New@Example.com");

    const confirm = await confirmChange(
      session.accessToken,
      "change-nopw-new@example.com",
      latestCode("change-nopw-new@example.com"),
    );

    expect(confirm.statusCode).toBe(200);
    const me = identityMeSchema.parse(JSON.parse(confirm.body));
    expect(me.email).toBe("change-nopw-new@example.com");
    expect(me.emailVerified).toBe(true);
    const again = identityMeSchema.parse(JSON.parse((await getMe(session.accessToken)).body));
    expect(again.email).toBe("change-nopw-new@example.com");
  });

  it("signs the new address into the same account afterwards, and the old address into nothing of theirs", async () => {
    const session = await signUpByCode("change-login-old@example.com");
    await requestChange(session.accessToken, "change-login-new@example.com");
    await confirmChange(
      session.accessToken,
      "change-login-new@example.com",
      latestCode("change-login-new@example.com"),
    );

    await app.inject({
      method: "POST",
      url: "/v1/identity/code",
      payload: { email: "change-login-new@example.com" },
    });
    const viaNew = await app.inject({
      method: "POST",
      url: "/v1/identity/code/verify",
      payload: {
        email: "change-login-new@example.com",
        code: latestCode("change-login-new@example.com"),
      },
    });
    expect(identitySessionSchema.parse(JSON.parse(viaNew.body)).user.id).toBe(session.user.id);

    await app.inject({
      method: "POST",
      url: "/v1/identity/code",
      payload: { email: "change-login-old@example.com" },
    });
    const viaOld = await app.inject({
      method: "POST",
      url: "/v1/identity/code/verify",
      payload: {
        email: "change-login-old@example.com",
        code: latestCode("change-login-old@example.com"),
      },
    });
    expect(identitySessionSchema.parse(JSON.parse(viaOld.body)).user.id).not.toBe(session.user.id);
  });

  it("changes nothing on a wrong code and still accepts the right one", async () => {
    const session = await signUpByCode("change-wrong@example.com");
    await requestChange(session.accessToken, "change-wrong-new@example.com");
    const code = latestCode("change-wrong-new@example.com");

    const wrong = await confirmChange(
      session.accessToken,
      "change-wrong-new@example.com",
      wrongCodeFor(code),
    );
    expect(wrong.statusCode).toBe(401);
    const unchanged = identityMeSchema.parse(JSON.parse((await getMe(session.accessToken)).body));
    expect(unchanged.email).toBe("change-wrong@example.com");

    const right = await confirmChange(session.accessToken, "change-wrong-new@example.com", code);
    expect(right.statusCode).toBe(200);
  });

  it("answers 410 and changes nothing for an expired code, and for an address that never asked", async () => {
    const session = await signUpByCode("change-expired@example.com");
    await requestChange(session.accessToken, "change-expired-new@example.com");
    const code = latestCode("change-expired-new@example.com");
    await helperDb.db
      .update(verification)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(verification.identifier, `email-change:${session.user.id}`));

    const expired = await confirmChange(
      session.accessToken,
      "change-expired-new@example.com",
      code,
    );
    expect(expired.statusCode).toBe(410);
    const never = await confirmChange(session.accessToken, "change-never@example.com", code);
    expect(never.statusCode).toBe(410);
    const me = identityMeSchema.parse(JSON.parse((await getMe(session.accessToken)).body));
    expect(me.email).toBe("change-expired@example.com");
  });

  it("refuses even the correct code after too many wrong guesses", async () => {
    const session = await signUpByCode("change-limit@example.com");
    await requestChange(session.accessToken, "change-limit-new@example.com");
    const code = latestCode("change-limit-new@example.com");

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const wrong = await confirmChange(
        session.accessToken,
        "change-limit-new@example.com",
        wrongCodeFor(code),
      );
      expect(wrong.statusCode).toBe(401);
    }

    const refused = await confirmChange(session.accessToken, "change-limit-new@example.com", code);
    expect(refused.statusCode).toBe(429);
    const me = identityMeSchema.parse(JSON.parse((await getMe(session.accessToken)).body));
    expect(me.email).toBe("change-limit@example.com");
  });

  it("does not let a code for one address confirm another", async () => {
    const session = await signUpByCode("change-bound@example.com");
    await requestChange(session.accessToken, "change-bound-a@example.com");
    const code = latestCode("change-bound-a@example.com");

    const other = await confirmChange(session.accessToken, "change-bound-b@example.com", code);

    expect(other.statusCode).toBe(401);
    const me = identityMeSchema.parse(JSON.parse((await getMe(session.accessToken)).body));
    expect(me.email).toBe("change-bound@example.com");
  });

  it("does not let another account use the code", async () => {
    const owner = await signUpByCode("change-owner@example.com");
    const other = await signUpByCode("change-other@example.com");
    await requestChange(owner.accessToken, "change-owner-new@example.com");
    const code = latestCode("change-owner-new@example.com");

    const stolen = await confirmChange(other.accessToken, "change-owner-new@example.com", code);

    expect(stolen.statusCode).toBe(410);
    const me = identityMeSchema.parse(JSON.parse((await getMe(other.accessToken)).body));
    expect(me.email).toBe("change-other@example.com");
  });

  it("answers a taken address exactly like a free one, and refuses only on the correct code", async () => {
    const mine = await signUpByCode("change-mine@example.com");
    await signUpByCode("change-taken@example.com");

    const free = await requestChange(mine.accessToken, "change-free@example.com");
    const taken = await requestChange(mine.accessToken, "change-taken@example.com");

    expect(taken.statusCode).toBe(free.statusCode);
    expect(taken.body).toBe(free.body);
    expect(latestCode("change-taken@example.com")).toMatch(/^\d{6}$/);

    const confirm = await confirmChange(
      mine.accessToken,
      "change-taken@example.com",
      latestCode("change-taken@example.com"),
    );
    expect(confirm.statusCode).toBe(409);
    const me = identityMeSchema.parse(JSON.parse((await getMe(mine.accessToken)).body));
    expect(me.email).toBe("change-mine@example.com");
    const [takenRow] = await helperDb.db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.email, "change-taken@example.com"));
    expect(takenRow?.email).toBe("change-taken@example.com");
  });

  it("rejects the current address, a bad address and a missing token", async () => {
    const session = await signUpByCode("change-same@example.com");

    expect((await requestChange(session.accessToken, "change-same@example.com")).statusCode).toBe(
      400,
    );
    expect((await requestChange(session.accessToken, "not-an-email")).statusCode).toBe(400);
    expect((await requestChange(null, "change-anon@example.com")).statusCode).toBe(401);
    expect((await confirmChange(null, "change-anon@example.com", "123456")).statusCode).toBe(401);
  });

  it("no longer has the password-confirmed route", async () => {
    const session = await signUpByCode("change-old-route@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/v1/identity/email",
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { email: "change-old-route-new@example.com", password: "password123" },
    });

    expect(response.statusCode).toBe(404);
  });
});
