-- 0038_conversation_per_pair
-- One Conversation per pair of Collectors. The UserJersey moves from the Conversation onto each
-- message, with a snapshot of what a card shows (club or national team, season, type, size).
-- Existing per-jersey Conversations of a pair are merged into the oldest one.
-- Safe to run again: the DDL is guarded and the merge runs only while
-- "conversation"."user_jersey_id" still exists.
-- Not reversible: the merge deletes the other Conversations of a pair and their participant
-- rows, and keeps one read time and one hidden state per Collector. Which thread an ordinary
-- message came from is not kept (a Bud keeps its UserJersey). There is no down.

ALTER TABLE "conversation_message" ADD COLUMN IF NOT EXISTS "user_jersey_id" uuid CONSTRAINT "conversation_message_user_jersey_id_user_jersey_id_fk" REFERENCES "public"."user_jersey"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_message" ADD COLUMN IF NOT EXISTS "jersey_club_id" uuid CONSTRAINT "conversation_message_jersey_club_id_club_id_fk" REFERENCES "public"."club"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_message" ADD COLUMN IF NOT EXISTS "jersey_national_team_id" uuid CONSTRAINT "conversation_message_jersey_national_team_id_fk" REFERENCES "public"."national_team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_message" ADD COLUMN IF NOT EXISTS "jersey_season_id" uuid CONSTRAINT "conversation_message_jersey_season_id_season_id_fk" REFERENCES "public"."season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_message" ADD COLUMN IF NOT EXISTS "jersey_type" "kit_type";--> statement-breakpoint
ALTER TABLE "conversation_message" ADD COLUMN IF NOT EXISTS "jersey_size" "jersey_size";--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'conversation'
      AND column_name = 'user_jersey_id'
  ) THEN
    -- Each Bud takes the UserJersey of its Conversation, before any message moves.
    UPDATE "conversation_message" m
    SET "user_jersey_id" = j."id",
        "jersey_club_id" = j."club_id",
        "jersey_national_team_id" = j."national_team_id",
        "jersey_season_id" = j."season_id",
        "jersey_type" = j."type",
        "jersey_size" = j."size"
    FROM "conversation" c
    JOIN "user_jersey" j ON j."id" = c."user_jersey_id"
    WHERE m."conversation_id" = c."id" AND m."kind" = 'bid';

    -- The survivor of a pair is its oldest Conversation.
    CREATE TEMP TABLE "conversation_merge" ON COMMIT DROP AS
    SELECT c."id" AS "conversation_id",
           first_value(c."id") OVER (
             PARTITION BY c."lower_collector_id", c."upper_collector_id"
             ORDER BY c."created_at", c."id"
           ) AS "survivor_id"
    FROM "conversation" c;

    -- Latest read time; hidden only when every merged thread was hidden for that Collector.
    INSERT INTO "conversation_participant" ("conversation_id", "user_id", "last_read_at", "hidden_at")
    SELECT g."survivor_id",
           p."user_id",
           max(p."last_read_at"),
           CASE WHEN count(*) = count(p."hidden_at") THEN max(p."hidden_at") END
    FROM "conversation_participant" p
    JOIN "conversation_merge" g ON g."conversation_id" = p."conversation_id"
    GROUP BY g."survivor_id", p."user_id"
    ON CONFLICT ("conversation_id", "user_id") DO UPDATE
    SET "last_read_at" = EXCLUDED."last_read_at",
        "hidden_at" = EXCLUDED."hidden_at";

    UPDATE "conversation_message" m
    SET "conversation_id" = g."survivor_id"
    FROM "conversation_merge" g
    WHERE m."conversation_id" = g."conversation_id" AND g."conversation_id" <> g."survivor_id";

    UPDATE "moderation_report" r
    SET "conversation_id" = g."survivor_id"
    FROM "conversation_merge" g
    WHERE r."conversation_id" = g."conversation_id" AND g."conversation_id" <> g."survivor_id";

    -- The list sorts on "updated_at": the survivor takes the latest of the merged ones.
    UPDATE "conversation" c
    SET "updated_at" = latest."updated_at"
    FROM (
      SELECT g."survivor_id", max(merged."updated_at") AS "updated_at"
      FROM "conversation" merged
      JOIN "conversation_merge" g ON g."conversation_id" = merged."id"
      GROUP BY g."survivor_id"
    ) latest
    WHERE c."id" = latest."survivor_id";

    DELETE FROM "conversation_participant" p
    USING "conversation_merge" g
    WHERE p."conversation_id" = g."conversation_id" AND g."conversation_id" <> g."survivor_id";

    DELETE FROM "conversation" c
    USING "conversation_merge" g
    WHERE c."id" = g."conversation_id" AND g."conversation_id" <> g."survivor_id";

    DROP TABLE "conversation_merge";

    -- Also drops "conversation_jersey_pair_unique" and the foreign key to "user_jersey".
    ALTER TABLE "conversation" DROP COLUMN "user_jersey_id";
  END IF;
END $$;--> statement-breakpoint
DROP INDEX IF EXISTS "conversation_jersey_pair_unique";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "conversation_pair_unique" ON "conversation" USING btree ("lower_collector_id","upper_collector_id");--> statement-breakpoint
ALTER TABLE "conversation_message" DROP CONSTRAINT IF EXISTS "conversation_message_bid_jersey_snapshot";--> statement-breakpoint
ALTER TABLE "conversation_message" ADD CONSTRAINT "conversation_message_bid_jersey_snapshot" CHECK (
  "kind" <> 'bid'
  OR (
    "jersey_season_id" IS NOT NULL
    AND "jersey_type" IS NOT NULL
    AND "jersey_size" IS NOT NULL
    AND (
      ("jersey_club_id" IS NOT NULL AND "jersey_national_team_id" IS NULL)
      OR ("jersey_club_id" IS NULL AND "jersey_national_team_id" IS NOT NULL)
    )
  )
);
