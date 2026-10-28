import "reflect-metadata";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NotificationPrefsUpdate } from "@kit/api-contract";
import { createDb, moderationBlock, resetDatabase, user } from "@kit/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ModerationService } from "../dist/moderation/moderation.service.js";
import { saveNotificationPrefs } from "../dist/notify/notification-prefs.js";
import { NotifyService } from "../dist/notify/notify.service.js";
import {
  RecordingMailerAdapter,
  recordedMails,
  resetRecordedMails,
} from "../dist/notify/recording-mailer.adapter.js";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/db/migrations",
);

const DATABASE_URL =
  process.env.API_TEST_DATABASE_URL ?? "postgresql://kit:kit@localhost:5432/kit_api_test";

const NO_EMAIL_SWITCHES: NotificationPrefsUpdate = {
  email: { bidsAndMessages: false, wishMatches: false, news: false },
};

// The kinds of the twelve mails in the e-mail lock, by number.
const BIDS_AND_MESSAGES = ["bid-new", "bid-accepted", "bid-declined", "message-new"] as const; // 05–08
const WISH_MATCHES = ["wish-match", "trial-ending", "plus-expired"] as const; // 09–11
const ALWAYS = [
  "code",
  "email-change-code",
  "email-changed",
  "account-deleted",
  "jersey-taken-down",
] as const; // 01–04 and 12

describe("Notify decides whether a mail is sent to a Collector", () => {
  let db: ReturnType<typeof createDb>;
  let notify: NotifyService;
  let userId: string;
  let counter = 0;

  beforeAll(async () => {
    await resetDatabase(DATABASE_URL, migrationsFolder);
    db = createDb(DATABASE_URL);
    notify = new NotifyService(new RecordingMailerAdapter(), db.db, new ModerationService(db.db));
  });

  afterAll(async () => {
    await db.pool.end();
  });

  beforeEach(async () => {
    counter += 1;
    const [created] = await db.db
      .insert(user)
      .values({
        email: `notify-pref-${counter}@example.com`,
        passwordHash: "x",
        handle: `notify-pref-${counter}`,
      })
      .returning({ id: user.id });
    if (!created) {
      throw new Error("The test Collector was not created");
    }
    userId = created.id;
  });

  it.each(BIDS_AND_MESSAGES)(
    "sends %s by default and stops when bidsAndMessages is off",
    async (kind) => {
      expect(await notify.shouldSend(kind, userId)).toBe(true);

      await saveNotificationPrefs(db.db, userId, { email: { bidsAndMessages: false } });

      expect(await notify.shouldSend(kind, userId)).toBe(false);
    },
  );

  it.each(WISH_MATCHES)("sends %s by default and stops when wishMatches is off", async (kind) => {
    expect(await notify.shouldSend(kind, userId)).toBe(true);

    await saveNotificationPrefs(db.db, userId, { email: { wishMatches: false } });

    expect(await notify.shouldSend(kind, userId)).toBe(false);
  });

  it("keeps the two switches apart", async () => {
    await saveNotificationPrefs(db.db, userId, { email: { bidsAndMessages: false } });
    expect(await notify.shouldSend("wish-match", userId)).toBe(true);
    expect(await notify.shouldSend("bid-new", userId)).toBe(false);

    await saveNotificationPrefs(db.db, userId, {
      email: { bidsAndMessages: true, wishMatches: false },
    });
    expect(await notify.shouldSend("bid-new", userId)).toBe(true);
    expect(await notify.shouldSend("wish-match", userId)).toBe(false);
  });

  it("ignores the push switches", async () => {
    await saveNotificationPrefs(db.db, userId, {
      push: { bids: false, messages: false, wishMatches: false },
    });

    expect(await notify.shouldSend("bid-new", userId)).toBe(true);
    expect(await notify.shouldSend("wish-match", userId)).toBe(true);
  });

  it.each(ALWAYS)("sends %s with every switch off", async (kind) => {
    await saveNotificationPrefs(db.db, userId, {
      ...NO_EMAIL_SWITCHES,
      push: { bids: false, messages: false, wishMatches: false },
    });

    expect(await notify.shouldSend(kind, userId)).toBe(true);
  });

  it("sends account-deleted to a Collector who has no row and no user", async () => {
    expect(await notify.shouldSend("account-deleted", crypto.randomUUID())).toBe(true);
  });
});

describe("Notify gates a bid mail to a Collector", () => {
  let db: ReturnType<typeof createDb>;
  let recipientId: string;
  let peerId: string;
  let counter = 0;

  const accepted = {
    kind: "bid-accepted" as const,
    data: {
      club: "FC København",
      meta: "Hjemme · 2023/24",
      amountDkk: 400,
      ownerHandle: "ejer",
      conversationId: "0b6c2f0e-6a52-4c53-8f7e-2f6d1a9a1c11",
    },
  };

  const serviceWith = (mailer: ConstructorParameters<typeof NotifyService>[0]) =>
    new NotifyService(mailer, db.db, new ModerationService(db.db));

  async function createCollector(label: string): Promise<string> {
    counter += 1;
    const [created] = await db.db
      .insert(user)
      .values({
        email: `notify-gate-${label}-${counter}@example.com`,
        passwordHash: "x",
        handle: `notify-gate-${label}-${counter}`,
      })
      .returning({ id: user.id });
    if (!created) {
      throw new Error("The test Collector was not created");
    }
    return created.id;
  }

  beforeAll(async () => {
    await resetDatabase(DATABASE_URL, migrationsFolder);
    db = createDb(DATABASE_URL);
  });

  afterAll(async () => {
    await db.pool.end();
  });

  beforeEach(async () => {
    resetRecordedMails();
    process.env.EMAIL_ASSET_BASE_URL = "https://assets.test/email";
    recipientId = await createCollector("recipient");
    peerId = await createCollector("peer");
  });

  it("sends to the recipient's address", async () => {
    await serviceWith(new RecordingMailerAdapter()).notifyCollector(accepted, {
      recipientId,
      peerId,
    });

    expect(recordedMails.map((mail) => mail.subject)).toEqual(["Dit bud er accepteret"]);
    expect(recordedMails[0]?.to).toMatch(/^notify-gate-recipient-/);
  });

  it.each([
    ["the recipient blocked the peer", () => [recipientId, peerId] as const],
    ["the peer blocked the recipient", () => [peerId, recipientId] as const],
  ])("sends nothing when %s", async (_name, pair) => {
    const [blockerId, blockedId] = pair();
    await db.db.insert(moderationBlock).values({ blockerId, blockedId });

    await serviceWith(new RecordingMailerAdapter()).notifyCollector(accepted, {
      recipientId,
      peerId,
    });

    expect(recordedMails).toHaveLength(0);
  });

  it("sends nothing when the recipient has Bud og beskeder off", async () => {
    await saveNotificationPrefs(db.db, recipientId, { email: { bidsAndMessages: false } });

    await serviceWith(new RecordingMailerAdapter()).notifyCollector(accepted, {
      recipientId,
      peerId,
    });

    expect(recordedMails).toHaveLength(0);
  });

  it("resolves when the mailer throws", async () => {
    const throwing = {
      send: async () => {
        throw new Error("ses is down");
      },
    };

    await expect(
      serviceWith(throwing).notifyCollector(accepted, { recipientId, peerId }),
    ).resolves.toBeUndefined();
  });

  it("sends nothing when the recipient no longer exists", async () => {
    await serviceWith(new RecordingMailerAdapter()).notifyCollector(accepted, {
      recipientId: crypto.randomUUID(),
      peerId,
    });

    expect(recordedMails).toHaveLength(0);
  });
});
