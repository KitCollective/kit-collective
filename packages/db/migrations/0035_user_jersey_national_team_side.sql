-- 0035_user_jersey_national_team_side
-- UserJersey and wishlist point at Club XOR NationalTeam (siblings).
-- Reverse (down):
--   ALTER TABLE "wishlist_entry" DROP CONSTRAINT IF EXISTS "wishlist_entry_side_xor";
--   ALTER TABLE "wishlist_entry" DROP CONSTRAINT IF EXISTS "wishlist_entry_national_team_id_national_team_id_fk";
--   ALTER TABLE "wishlist_entry" DROP COLUMN IF EXISTS "national_team_id";
--   ALTER TABLE "vision_log" DROP CONSTRAINT IF EXISTS "vision_log_suggested_national_team_id_national_team_id_fk";
--   ALTER TABLE "vision_log" DROP COLUMN IF EXISTS "suggested_national_team_id";
--   ALTER TABLE "user_jersey" DROP CONSTRAINT IF EXISTS "user_jersey_side_xor";
--   ALTER TABLE "user_jersey" DROP CONSTRAINT IF EXISTS "user_jersey_national_team_id_national_team_id_fk";
--   ALTER TABLE "user_jersey" DROP COLUMN IF EXISTS "national_team_id";
--   ALTER TABLE "user_jersey" ALTER COLUMN "club_id" SET NOT NULL;

ALTER TABLE "user_jersey" ALTER COLUMN "club_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_jersey" ADD COLUMN "national_team_id" uuid;--> statement-breakpoint
ALTER TABLE "user_jersey" ADD CONSTRAINT "user_jersey_national_team_id_national_team_id_fk" FOREIGN KEY ("national_team_id") REFERENCES "public"."national_team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_jersey" ADD CONSTRAINT "user_jersey_side_xor" CHECK (
  ("club_id" IS NOT NULL AND "national_team_id" IS NULL)
  OR ("club_id" IS NULL AND "national_team_id" IS NOT NULL)
);--> statement-breakpoint
ALTER TABLE "vision_log" ADD COLUMN "suggested_national_team_id" uuid;--> statement-breakpoint
ALTER TABLE "vision_log" ADD CONSTRAINT "vision_log_suggested_national_team_id_national_team_id_fk" FOREIGN KEY ("suggested_national_team_id") REFERENCES "public"."national_team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_entry" ADD COLUMN "national_team_id" uuid;--> statement-breakpoint
ALTER TABLE "wishlist_entry" ADD CONSTRAINT "wishlist_entry_national_team_id_national_team_id_fk" FOREIGN KEY ("national_team_id") REFERENCES "public"."national_team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_entry" ADD CONSTRAINT "wishlist_entry_side_xor" CHECK (
  NOT ("club_id" IS NOT NULL AND "national_team_id" IS NOT NULL)
);
