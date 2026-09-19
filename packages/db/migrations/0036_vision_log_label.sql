-- 0036_vision_log_label
-- Persist Vision label + eval class on identity vision_log at Save.
-- Reverse (down):
--   ALTER TABLE "vision_log" DROP CONSTRAINT IF EXISTS "vision_log_selected_patch_id_patch_id_fk";
--   ALTER TABLE "vision_log" DROP CONSTRAINT IF EXISTS "vision_log_selected_player_id_player_id_fk";
--   ALTER TABLE "vision_log" DROP CONSTRAINT IF EXISTS "vision_log_selected_catalog_kit_id_kit_id_fk";
--   ALTER TABLE "vision_log" DROP CONSTRAINT IF EXISTS "vision_log_selected_season_id_season_id_fk";
--   ALTER TABLE "vision_log" DROP CONSTRAINT IF EXISTS "vision_log_selected_national_team_id_national_team_id_fk";
--   ALTER TABLE "vision_log" DROP CONSTRAINT IF EXISTS "vision_log_selected_club_id_club_id_fk";
--   ALTER TABLE "vision_log" DROP COLUMN IF EXISTS "photo_keys";
--   ALTER TABLE "vision_log" DROP COLUMN IF EXISTS "field_hits";
--   ALTER TABLE "vision_log" DROP COLUMN IF EXISTS "eval_class";
--   ALTER TABLE "vision_log" DROP COLUMN IF EXISTS "selected_patch_id";
--   ALTER TABLE "vision_log" DROP COLUMN IF EXISTS "selected_player_id";
--   ALTER TABLE "vision_log" DROP COLUMN IF EXISTS "selected_catalog_kit_id";
--   ALTER TABLE "vision_log" DROP COLUMN IF EXISTS "selected_type";
--   ALTER TABLE "vision_log" DROP COLUMN IF EXISTS "selected_season_id";
--   ALTER TABLE "vision_log" DROP COLUMN IF EXISTS "selected_national_team_id";
--   ALTER TABLE "vision_log" DROP COLUMN IF EXISTS "selected_club_id";
--   DROP TYPE IF EXISTS "public"."vision_eval_class";

CREATE TYPE "public"."vision_eval_class" AS ENUM('accepted', 'alias', 'coverage', 'model', 'transport');--> statement-breakpoint
ALTER TABLE "vision_log" ADD COLUMN "selected_club_id" uuid;--> statement-breakpoint
ALTER TABLE "vision_log" ADD COLUMN "selected_national_team_id" uuid;--> statement-breakpoint
ALTER TABLE "vision_log" ADD COLUMN "selected_season_id" uuid;--> statement-breakpoint
ALTER TABLE "vision_log" ADD COLUMN "selected_type" "kit_type";--> statement-breakpoint
ALTER TABLE "vision_log" ADD COLUMN "selected_catalog_kit_id" uuid;--> statement-breakpoint
ALTER TABLE "vision_log" ADD COLUMN "selected_player_id" uuid;--> statement-breakpoint
ALTER TABLE "vision_log" ADD COLUMN "selected_patch_id" uuid;--> statement-breakpoint
ALTER TABLE "vision_log" ADD COLUMN "eval_class" "vision_eval_class";--> statement-breakpoint
ALTER TABLE "vision_log" ADD COLUMN "field_hits" text;--> statement-breakpoint
ALTER TABLE "vision_log" ADD COLUMN "photo_keys" text;--> statement-breakpoint
ALTER TABLE "vision_log" ADD CONSTRAINT "vision_log_selected_club_id_club_id_fk" FOREIGN KEY ("selected_club_id") REFERENCES "public"."club"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vision_log" ADD CONSTRAINT "vision_log_selected_national_team_id_national_team_id_fk" FOREIGN KEY ("selected_national_team_id") REFERENCES "public"."national_team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vision_log" ADD CONSTRAINT "vision_log_selected_season_id_season_id_fk" FOREIGN KEY ("selected_season_id") REFERENCES "public"."season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vision_log" ADD CONSTRAINT "vision_log_selected_catalog_kit_id_kit_id_fk" FOREIGN KEY ("selected_catalog_kit_id") REFERENCES "public"."kit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vision_log" ADD CONSTRAINT "vision_log_selected_player_id_player_id_fk" FOREIGN KEY ("selected_player_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vision_log" ADD CONSTRAINT "vision_log_selected_patch_id_patch_id_fk" FOREIGN KEY ("selected_patch_id") REFERENCES "public"."patch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vision_log_eval_class_idx" ON "vision_log" USING btree ("eval_class");--> statement-breakpoint
CREATE INDEX "vision_log_user_action_idx" ON "vision_log" USING btree ("user_action");
