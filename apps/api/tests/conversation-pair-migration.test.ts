import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDb, migrate, resetDatabase } from "@kit/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/db/migrations",
);

const DATABASE_URL =
  process.env.API_TEST_DATABASE_URL ?? "postgresql://kit:kit@localhost:5432/kit_api_test";

const MIGRATION_TAG = "0038_conversation_per_pair";

const id = (suffix: string) => `00000000-0000-4000-8000-0000000000${suffix}`;

// Two pairs of Collectors: Anna + Bo share three per-jersey Conversations, Carl + Dan share one.
const ANNA = id("a1");
const BO = id("a2");
const CARL = id("a3");
const DAN = id("a4");

const CLUB = id("b1");
const NATIONAL_TEAM = id("b2");
const SEASON_ONE = id("b3");
const SEASON_TWO = id("b4");

const ANNA_HOME = id("d1");
const ANNA_AWAY = id("d2");
const BO_NATIONAL = id("d3");
const CARL_HOME = id("d4");

// The oldest thread is neither the first inserted nor the lowest id.
const THREAD_SECOND = id("c1");
const THREAD_OLDEST = id("c2");
const THREAD_THIRD = id("c3");
const THREAD_SINGLE = id("c4");

const BID_OLDEST = id("e1");
const TEXT_OLDEST = id("e2");
const REPLY_OLDEST = id("e3");
const BID_SECOND = id("e4");
const IMAGE_SECOND = id("e5");
const BID_THIRD = id("e6");
const TEXT_THIRD = id("e7");
const BID_SINGLE = id("e8");
const TEXT_SINGLE = id("e9");

const REPORT_ON_MERGED = id("f1");
const REPORT_ON_SURVIVOR = id("f2");
const REPORT_ON_SINGLE = id("f3");
const REPORT_WITHOUT_THREAD = id("f4");

const MESSAGE_COLUMNS =
  "id, sender_id, kind, body, image_object_key, reply_to_message_id, bid_amount_dkk, bid_status, created_at";

/** A copy of the migrations whose journal stops before the migration under test. */
function migrationsBefore(tag: string): string {
  const folder = mkdtempSync(path.join(os.tmpdir(), "kit-migrations-"));
  cpSync(migrationsFolder, folder, { recursive: true });
  const journalPath = path.join(folder, "meta/_journal.json");
  // SAFETY: the journal is this repo's own file; every entry carries its migration tag.
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
    entries: Array<{ tag: string }>;
  };
  journal.entries = journal.entries.filter((entry) => entry.tag < tag);
  writeFileSync(journalPath, JSON.stringify(journal));
  return folder;
}

describe("Conversation per pair migration", () => {
  const { pool } = createDb(DATABASE_URL);
  let folderBefore: string;
  let messagesBefore: unknown[];

  async function rows(text: string, values: unknown[] = []) {
    // SAFETY: pg returns each row as an object keyed by column name.
    return (await pool.query(text, values)).rows as Array<Record<string, unknown>>;
  }

  async function seedPerJerseyConversations() {
    const [country] = await rows("SELECT id FROM country LIMIT 1");
    await pool.query(
      `INSERT INTO "user" (id, email, password_hash, handle) VALUES
        ($1, 'anna@example.com', 'hash', 'anna'),
        ($2, 'bo@example.com', 'hash', 'bo'),
        ($3, 'carl@example.com', 'hash', 'carl'),
        ($4, 'dan@example.com', 'hash', 'dan')`,
      [ANNA, BO, CARL, DAN],
    );
    await pool.query("INSERT INTO club (id, country_id) VALUES ($1, $2)", [CLUB, country!.id]);
    await pool.query("INSERT INTO national_team (id, country_id, gender) VALUES ($1, $2, 'men')", [
      NATIONAL_TEAM,
      country!.id,
    ]);
    await pool.query(
      `INSERT INTO season (id, label, starts_on, ends_on, calendar_kind) VALUES
        ($1, '2023/24', '2023-07-01', '2024-06-30', 'split_year'),
        ($2, '2024/25', '2024-07-01', '2025-06-30', 'split_year')`,
      [SEASON_ONE, SEASON_TWO],
    );
    await pool.query(
      `INSERT INTO user_jersey (id, user_id, club_id, national_team_id, season_id, type, size, condition) VALUES
        ($1, $5, $8, NULL, $10, 'home', 'm', 'used'),
        ($2, $5, $8, NULL, $11, 'away', 'l', 'used'),
        ($3, $6, NULL, $9, $10, 'third', 'xl', 'used'),
        ($4, $7, $8, NULL, $10, 'home', 's', 'used')`,
      [
        ANNA_HOME,
        ANNA_AWAY,
        BO_NATIONAL,
        CARL_HOME,
        ANNA,
        BO,
        CARL,
        CLUB,
        NATIONAL_TEAM,
        SEASON_ONE,
        SEASON_TWO,
      ],
    );
    await pool.query(
      `INSERT INTO conversation (id, user_jersey_id, lower_collector_id, upper_collector_id, created_at, updated_at) VALUES
        ($1, $5, $9, $10, '2026-02-01T09:00:00Z', '2026-02-05T10:00:00Z'),
        ($2, $6, $9, $10, '2026-01-01T09:00:00Z', '2026-01-03T10:00:00Z'),
        ($3, $7, $9, $10, '2026-03-01T09:00:00Z', '2026-03-09T10:00:00Z'),
        ($4, $8, $11, $12, '2026-01-15T09:00:00Z', '2026-01-16T10:00:00Z')`,
      [
        THREAD_SECOND,
        THREAD_OLDEST,
        THREAD_THIRD,
        THREAD_SINGLE,
        ANNA_AWAY,
        ANNA_HOME,
        BO_NATIONAL,
        CARL_HOME,
        ANNA,
        BO,
        CARL,
        DAN,
      ],
    );
    // Anna hid all three threads; Bo hid only the one that survives.
    await pool.query(
      `INSERT INTO conversation_participant (conversation_id, user_id, last_read_at, hidden_at) VALUES
        ($1, $5, '2026-01-02T12:00:00Z', '2026-01-10T12:00:00Z'),
        ($2, $5, '2026-02-06T12:00:00Z', '2026-02-10T12:00:00Z'),
        ($3, $5, NULL, '2026-03-10T12:00:00Z'),
        ($1, $6, NULL, '2026-01-11T12:00:00Z'),
        ($2, $6, '2026-02-05T11:00:00Z', NULL),
        ($3, $6, '2026-03-09T11:00:00Z', NULL),
        ($4, $7, '2026-01-16T12:00:00Z', '2026-01-20T12:00:00Z'),
        ($4, $8, NULL, NULL)`,
      [THREAD_OLDEST, THREAD_SECOND, THREAD_THIRD, THREAD_SINGLE, ANNA, BO, CARL, DAN],
    );
    await pool.query(
      `INSERT INTO conversation_message (id, conversation_id, sender_id, kind, body, image_object_key, reply_to_message_id, bid_amount_dkk, bid_status, created_at) VALUES
        ($1, $10, $15, 'bid', NULL, NULL, NULL, 300, 'pending', '2026-01-01T10:00:00Z'),
        ($2, $10, $14, 'text', 'Hej', NULL, NULL, NULL, NULL, '2026-01-02T10:00:00Z'),
        ($3, $10, $15, 'text', 'Svar', NULL, $2, NULL, NULL, '2026-01-03T10:00:00Z'),
        ($4, $11, $15, 'bid', NULL, NULL, NULL, 450, 'declined', '2026-02-01T10:00:00Z'),
        ($5, $11, $15, 'image', NULL, $18, NULL, NULL, NULL, '2026-02-05T10:00:00Z'),
        ($6, $12, $14, 'bid', NULL, NULL, NULL, 800, 'accepted', '2026-03-01T10:00:00Z'),
        ($7, $12, $15, 'text', 'Aftale', NULL, NULL, NULL, NULL, '2026-03-09T10:00:00Z'),
        ($8, $13, $17, 'bid', NULL, NULL, NULL, 200, 'pending', '2026-01-15T10:00:00Z'),
        ($9, $13, $16, 'text', 'Tak', NULL, NULL, NULL, NULL, '2026-01-16T10:00:00Z')`,
      [
        BID_OLDEST,
        TEXT_OLDEST,
        REPLY_OLDEST,
        BID_SECOND,
        IMAGE_SECOND,
        BID_THIRD,
        TEXT_THIRD,
        BID_SINGLE,
        TEXT_SINGLE,
        THREAD_OLDEST,
        THREAD_SECOND,
        THREAD_THIRD,
        THREAD_SINGLE,
        ANNA,
        BO,
        CARL,
        DAN,
        `conversation/${THREAD_SECOND}/${IMAGE_SECOND}.jpg`,
      ],
    );
    await pool.query(
      `INSERT INTO moderation_report (id, reporter_id, peer_id, conversation_id, reason) VALUES
        ($1, $5, $6, $9, 'spam'),
        ($2, $6, $5, $10, NULL),
        ($3, $8, $7, $11, NULL),
        ($4, $5, $7, NULL, NULL)`,
      [
        REPORT_ON_MERGED,
        REPORT_ON_SURVIVOR,
        REPORT_ON_SINGLE,
        REPORT_WITHOUT_THREAD,
        ANNA,
        BO,
        CARL,
        DAN,
        THREAD_SECOND,
        THREAD_OLDEST,
        THREAD_SINGLE,
      ],
    );
  }

  async function conversationTables() {
    return {
      conversation: await rows("SELECT * FROM conversation ORDER BY id"),
      participant: await rows(
        "SELECT * FROM conversation_participant ORDER BY conversation_id, user_id",
      ),
      message: await rows("SELECT * FROM conversation_message ORDER BY id"),
      report: await rows("SELECT * FROM moderation_report ORDER BY id"),
    };
  }

  beforeAll(async () => {
    folderBefore = migrationsBefore(MIGRATION_TAG);
    await resetDatabase(DATABASE_URL, folderBefore);
    await seedPerJerseyConversations();
    messagesBefore = await rows(`SELECT ${MESSAGE_COLUMNS} FROM conversation_message ORDER BY id`);

    await migrate(DATABASE_URL, migrationsFolder);
  });

  afterAll(async () => {
    await pool.end();
    rmSync(folderBefore, { recursive: true, force: true });
  });

  it("leaves a Conversation without a UserJersey and one Conversation per pair", async () => {
    const jerseyColumns = await rows(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'conversation' AND column_name = 'user_jersey_id'`,
    );
    expect(jerseyColumns).toEqual([]);

    await expect(
      pool.query(
        "INSERT INTO conversation (lower_collector_id, upper_collector_id) VALUES ($1, $2)",
        [ANNA, BO],
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("merges the Conversations of a pair into the oldest one and keeps every message's time and sender", async () => {
    const conversations = await rows(
      "SELECT id, lower_collector_id, upper_collector_id, created_at, updated_at FROM conversation ORDER BY id",
    );
    expect(conversations).toEqual([
      {
        id: THREAD_OLDEST,
        lower_collector_id: ANNA,
        upper_collector_id: BO,
        created_at: new Date("2026-01-01T09:00:00Z"),
        updated_at: new Date("2026-03-09T10:00:00Z"),
      },
      {
        id: THREAD_SINGLE,
        lower_collector_id: CARL,
        upper_collector_id: DAN,
        created_at: new Date("2026-01-15T09:00:00Z"),
        updated_at: new Date("2026-01-16T10:00:00Z"),
      },
    ]);

    const placement = await rows("SELECT id, conversation_id FROM conversation_message");
    const threadByMessage = new Map(placement.map((row) => [row.id, row.conversation_id]));
    for (const messageId of [
      BID_OLDEST,
      TEXT_OLDEST,
      REPLY_OLDEST,
      BID_SECOND,
      IMAGE_SECOND,
      BID_THIRD,
      TEXT_THIRD,
    ]) {
      expect(threadByMessage.get(messageId)).toBe(THREAD_OLDEST);
    }
    expect(threadByMessage.get(BID_SINGLE)).toBe(THREAD_SINGLE);
    expect(threadByMessage.get(TEXT_SINGLE)).toBe(THREAD_SINGLE);

    expect(messagesBefore).toHaveLength(9);
    expect(await rows(`SELECT ${MESSAGE_COLUMNS} FROM conversation_message ORDER BY id`)).toEqual(
      messagesBefore,
    );
  });

  it("gives each Bud the UserJersey of its former Conversation with its snapshot", async () => {
    const jerseyColumns =
      "id, user_jersey_id, jersey_club_id, jersey_national_team_id, jersey_season_id, jersey_type, jersey_size";
    const bids = await rows(
      `SELECT ${jerseyColumns} FROM conversation_message WHERE kind = 'bid' ORDER BY id`,
    );
    expect(bids).toEqual([
      {
        id: BID_OLDEST,
        user_jersey_id: ANNA_HOME,
        jersey_club_id: CLUB,
        jersey_national_team_id: null,
        jersey_season_id: SEASON_ONE,
        jersey_type: "home",
        jersey_size: "m",
      },
      {
        id: BID_SECOND,
        user_jersey_id: ANNA_AWAY,
        jersey_club_id: CLUB,
        jersey_national_team_id: null,
        jersey_season_id: SEASON_TWO,
        jersey_type: "away",
        jersey_size: "l",
      },
      {
        id: BID_THIRD,
        user_jersey_id: BO_NATIONAL,
        jersey_club_id: null,
        jersey_national_team_id: NATIONAL_TEAM,
        jersey_season_id: SEASON_ONE,
        jersey_type: "third",
        jersey_size: "xl",
      },
      {
        id: BID_SINGLE,
        user_jersey_id: CARL_HOME,
        jersey_club_id: CLUB,
        jersey_national_team_id: null,
        jersey_season_id: SEASON_ONE,
        jersey_type: "home",
        jersey_size: "s",
      },
    ]);

    const ordinaryWithJersey = await rows(
      "SELECT id FROM conversation_message WHERE kind <> 'bid' AND user_jersey_id IS NOT NULL",
    );
    expect(ordinaryWithJersey).toEqual([]);
  });

  it("keeps the latest read time and hides a thread only when every merged thread was hidden", async () => {
    const participants = await rows(
      "SELECT conversation_id, user_id, last_read_at, hidden_at FROM conversation_participant ORDER BY conversation_id, user_id",
    );
    expect(participants).toEqual([
      {
        conversation_id: THREAD_OLDEST,
        user_id: ANNA,
        last_read_at: new Date("2026-02-06T12:00:00Z"),
        hidden_at: new Date("2026-03-10T12:00:00Z"),
      },
      {
        conversation_id: THREAD_OLDEST,
        user_id: BO,
        last_read_at: new Date("2026-03-09T11:00:00Z"),
        hidden_at: null,
      },
      {
        conversation_id: THREAD_SINGLE,
        user_id: CARL,
        last_read_at: new Date("2026-01-16T12:00:00Z"),
        hidden_at: new Date("2026-01-20T12:00:00Z"),
      },
      { conversation_id: THREAD_SINGLE, user_id: DAN, last_read_at: null, hidden_at: null },
    ]);
  });

  it("points moderation reports on a merged Conversation at the surviving one", async () => {
    const reports = await rows("SELECT id, conversation_id FROM moderation_report ORDER BY id");
    expect(reports).toEqual([
      { id: REPORT_ON_MERGED, conversation_id: THREAD_OLDEST },
      { id: REPORT_ON_SURVIVOR, conversation_id: THREAD_OLDEST },
      { id: REPORT_ON_SINGLE, conversation_id: THREAD_SINGLE },
      { id: REPORT_WITHOUT_THREAD, conversation_id: null },
    ]);
  });

  it("changes nothing when its statements run a second time", async () => {
    const before = await conversationTables();
    expect(before.message).toHaveLength(9);

    const statements = readFileSync(path.join(migrationsFolder, `${MIGRATION_TAG}.sql`), "utf8")
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);
    for (const statement of statements) {
      await pool.query(statement);
    }

    expect(await conversationTables()).toEqual(before);
  });

  it("refuses a Bud without a UserJersey snapshot", async () => {
    await expect(
      pool.query(
        `INSERT INTO conversation_message (conversation_id, sender_id, kind, bid_amount_dkk, bid_status)
          VALUES ($1, $2, 'bid', 500, 'pending')`,
        [THREAD_OLDEST, BO],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    // Club and national team together are not a snapshot either.
    await expect(
      pool.query(
        `INSERT INTO conversation_message
          (conversation_id, sender_id, kind, bid_amount_dkk, bid_status, user_jersey_id,
           jersey_club_id, jersey_national_team_id, jersey_season_id, jersey_type, jersey_size)
          VALUES ($1, $2, 'bid', 500, 'pending', $3, $4, $5, $6, 'home', 'm')`,
        [THREAD_OLDEST, BO, ANNA_HOME, CLUB, NATIONAL_TEAM, SEASON_ONE],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("accepts an ordinary message with a UserJersey and its snapshot", async () => {
    const [inserted] = await rows(
      `INSERT INTO conversation_message
        (conversation_id, sender_id, kind, body, user_jersey_id,
         jersey_club_id, jersey_season_id, jersey_type, jersey_size)
        VALUES ($1, $2, 'text', 'Er den stadig til salg?', $3, $4, $5, 'home', 'm')
        RETURNING user_jersey_id, jersey_club_id, jersey_season_id, jersey_type, jersey_size`,
      [THREAD_OLDEST, BO, ANNA_HOME, CLUB, SEASON_ONE],
    );
    expect(inserted).toEqual({
      user_jersey_id: ANNA_HOME,
      jersey_club_id: CLUB,
      jersey_season_id: SEASON_ONE,
      jersey_type: "home",
      jersey_size: "m",
    });
  });
});
