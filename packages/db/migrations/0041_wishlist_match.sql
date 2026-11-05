-- 0041_wishlist_match
-- A Wish keeps every Match: one row per Wishlist row and UserJersey, with when it was found and
-- whether the Collector has seen it. Replaces the single matched jersey the list used to compute.
-- The carry-over inserts every pair the match rule gives today (another Collector's jersey, åben for
-- bud, not private, not a catalog Kit, every set facet equal, no block either way) as unseen, so an
-- existing hit shows once as new.
-- Safe to run again: every statement is guarded.
-- Down:
--   DROP TABLE IF EXISTS "wishlist_match";

CREATE TABLE IF NOT EXISTS "wishlist_match" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "wishlist_entry_id" uuid NOT NULL,
  "user_jersey_id" uuid NOT NULL,
  "found_at" timestamp with time zone DEFAULT now() NOT NULL,
  "seen" boolean DEFAULT false NOT NULL
);--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "wishlist_match"
    ADD CONSTRAINT "wishlist_match_wishlist_entry_id_wishlist_entry_id_fk"
    FOREIGN KEY ("wishlist_entry_id") REFERENCES "public"."wishlist_entry"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "wishlist_match"
    ADD CONSTRAINT "wishlist_match_user_jersey_id_user_jersey_id_fk"
    FOREIGN KEY ("user_jersey_id") REFERENCES "public"."user_jersey"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wishlist_match_pair_unique"
  ON "wishlist_match" USING btree ("wishlist_entry_id", "user_jersey_id");--> statement-breakpoint
INSERT INTO "wishlist_match" ("wishlist_entry_id", "user_jersey_id")
SELECT w."id", j."id"
FROM "wishlist_entry" w
JOIN "user_jersey" j
  ON j."user_id" <> w."user_id"
 AND j."bidding_enabled" = true
 AND j."private" = false
 AND j."catalog_kit_id" IS NULL
 AND (w."club_id" IS NULL OR w."club_id" = j."club_id")
 AND (w."national_team_id" IS NULL OR w."national_team_id" = j."national_team_id")
 AND (w."season_id" IS NULL OR w."season_id" = j."season_id")
 AND (w."type" IS NULL OR w."type" = j."type")
 AND (w."size" IS NULL OR w."size" = j."size")
WHERE NOT EXISTS (
  SELECT 1 FROM "moderation_block" b
  WHERE (b."blocker_id" = w."user_id" AND b."blocked_id" = j."user_id")
     OR (b."blocker_id" = j."user_id" AND b."blocked_id" = w."user_id")
)
ON CONFLICT DO NOTHING;
