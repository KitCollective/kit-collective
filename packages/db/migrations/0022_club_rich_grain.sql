-- 0022_club_rich_grain
-- Club Rich grain: club facts, player body, player_club_season.position,
-- honour, player_jersey_number, player_photo.
--
-- Reverse (down):
--   DROP TABLE IF EXISTS "player_photo";
--   DROP TABLE IF EXISTS "player_jersey_number";
--   DROP TABLE IF EXISTS "honour";
--   ALTER TABLE "player_club_season" DROP COLUMN IF EXISTS "position";
--   ALTER TABLE "player" DROP COLUMN IF EXISTS "place_of_birth";
--   ALTER TABLE "player" DROP COLUMN IF EXISTS "primary_country_id";
--   ALTER TABLE "player" DROP COLUMN IF EXISTS "preferred_foot";
--   ALTER TABLE "player" DROP COLUMN IF EXISTS "height_cm";
--   ALTER TABLE "player" DROP COLUMN IF EXISTS "date_of_birth";
--   ALTER TABLE "club" DROP COLUMN IF EXISTS "website_url";
--   ALTER TABLE "club" DROP COLUMN IF EXISTS "secondary_color_hex";
--   ALTER TABLE "club" DROP COLUMN IF EXISTS "primary_color_hex";
--   ALTER TABLE "club" DROP COLUMN IF EXISTS "stadium_capacity";
--   ALTER TABLE "club" DROP COLUMN IF EXISTS "stadium_name";
--   ALTER TABLE "club" DROP COLUMN IF EXISTS "founded_on";
--   DROP TYPE IF EXISTS "public"."honour_subject_type";
--   DROP TYPE IF EXISTS "public"."preferred_foot";

CREATE TYPE "public"."preferred_foot" AS ENUM('left', 'right', 'both');
--> statement-breakpoint
CREATE TYPE "public"."honour_subject_type" AS ENUM('club', 'national_team', 'player');
--> statement-breakpoint
ALTER TABLE "club" ADD COLUMN "founded_on" date;
--> statement-breakpoint
ALTER TABLE "club" ADD COLUMN "stadium_name" text;
--> statement-breakpoint
ALTER TABLE "club" ADD COLUMN "stadium_capacity" integer;
--> statement-breakpoint
ALTER TABLE "club" ADD COLUMN "primary_color_hex" text;
--> statement-breakpoint
ALTER TABLE "club" ADD COLUMN "secondary_color_hex" text;
--> statement-breakpoint
ALTER TABLE "club" ADD COLUMN "website_url" text;
--> statement-breakpoint
ALTER TABLE "player" ADD COLUMN "date_of_birth" date;
--> statement-breakpoint
ALTER TABLE "player" ADD COLUMN "height_cm" smallint;
--> statement-breakpoint
ALTER TABLE "player" ADD COLUMN "preferred_foot" "preferred_foot";
--> statement-breakpoint
ALTER TABLE "player" ADD COLUMN "primary_country_id" uuid;
--> statement-breakpoint
ALTER TABLE "player" ADD COLUMN "place_of_birth" text;
--> statement-breakpoint
ALTER TABLE "player_club_season" ADD COLUMN "position" text;
--> statement-breakpoint
CREATE TABLE "honour" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" "honour_subject_type" NOT NULL,
	"subject_id" uuid NOT NULL,
	"season_label" text,
	"title" text NOT NULL,
	"source" "label_source" DEFAULT 'seed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_jersey_number" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"season_id" uuid,
	"season_label" text,
	"club_id" uuid,
	"national_team_id" uuid,
	"squad_number" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_photo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"rights" "kit_photo_rights" DEFAULT 'unresolved' NOT NULL,
	"visibility" "kit_photo_visibility" DEFAULT 'admin_only' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "player" ADD CONSTRAINT "player_primary_country_id_country_id_fk" FOREIGN KEY ("primary_country_id") REFERENCES "public"."country"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "player_jersey_number" ADD CONSTRAINT "player_jersey_number_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "player_jersey_number" ADD CONSTRAINT "player_jersey_number_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "player_jersey_number" ADD CONSTRAINT "player_jersey_number_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "player_jersey_number" ADD CONSTRAINT "player_jersey_number_national_team_id_national_team_id_fk" FOREIGN KEY ("national_team_id") REFERENCES "public"."national_team"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "player_photo" ADD CONSTRAINT "player_photo_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "honour_subject_season_title_unique" ON "honour" USING btree ("subject_type","subject_id",(COALESCE("season_label", '')),"title");
--> statement-breakpoint
CREATE UNIQUE INDEX "player_jersey_number_upsert_unique" ON "player_jersey_number" USING btree ("player_id",(COALESCE("season_label", '')),(COALESCE("club_id", '00000000-0000-0000-0000-000000000000'::uuid)),(COALESCE("national_team_id", '00000000-0000-0000-0000-000000000000'::uuid)),(COALESCE("squad_number", -1)));
