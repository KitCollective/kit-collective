-- 0031_jersey_number_vendor_side
-- Jersey number history: keep the vendor side identity on the row.
--
-- `/rueckennummern/spieler/<id>` lists a player's whole career, so most sides on it are
-- clubs and national sides we have not seeded (measured on 18 real pages: 172 of 464 rows
-- resolved to a lane club, 0 to a lane national team). Without the vendor id those rows
-- could only land with both FKs NULL, and the 0022 unique index would then fold every
-- same-season same-number row into one — Jérémie Boga's 2014/15 Chelsea U18 #15 and
-- Chelsea U21 #15 collapse to a single row. `side_external_id` is the discriminator and
-- the join key that lets a later run attach the FK once that side is seeded.
--
-- Additive: two nullable columns; the unique index gains a column and is otherwise the
-- 0022 expression. Table was empty when this landed.
--
-- Reverse (down):
--   DROP INDEX IF EXISTS "player_jersey_number_upsert_unique";
--   CREATE UNIQUE INDEX "player_jersey_number_upsert_unique" ON "player_jersey_number"
--     USING btree ("player_id",(COALESCE("season_label", '')),(COALESCE("club_id", '00000000-0000-0000-0000-000000000000'::uuid)),(COALESCE("national_team_id", '00000000-0000-0000-0000-000000000000'::uuid)),(COALESCE("squad_number", -1)));
--   ALTER TABLE "player_jersey_number" DROP COLUMN IF EXISTS "side_name";
--   ALTER TABLE "player_jersey_number" DROP COLUMN IF EXISTS "side_external_id";

ALTER TABLE "player_jersey_number" ADD COLUMN "side_external_id" text;
--> statement-breakpoint
ALTER TABLE "player_jersey_number" ADD COLUMN "side_name" text;
--> statement-breakpoint
DROP INDEX IF EXISTS "player_jersey_number_upsert_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "player_jersey_number_upsert_unique" ON "player_jersey_number" USING btree ("player_id",(COALESCE("season_label", '')),(COALESCE("side_external_id", '')),(COALESCE("club_id", '00000000-0000-0000-0000-000000000000'::uuid)),(COALESCE("national_team_id", '00000000-0000-0000-0000-000000000000'::uuid)),(COALESCE("squad_number", -1)));
