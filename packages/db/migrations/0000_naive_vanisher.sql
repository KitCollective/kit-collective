CREATE TYPE "public"."calendar_kind" AS ENUM('split_year', 'calendar');--> statement-breakpoint
CREATE TYPE "public"."catalog_entity_type" AS ENUM('country', 'league', 'club', 'national_team', 'manufacturer', 'patch', 'player');--> statement-breakpoint
CREATE TYPE "public"."club_kind" AS ENUM('club', 'farm', 'dissolved');--> statement-breakpoint
CREATE TYPE "public"."external_id_entity_type" AS ENUM('country', 'league', 'club', 'national_team', 'player', 'kit');--> statement-breakpoint
CREATE TYPE "public"."kit_photo_rights" AS ENUM('unresolved', 'cleared');--> statement-breakpoint
CREATE TYPE "public"."kit_photo_visibility" AS ENUM('admin_only', 'public');--> statement-breakpoint
CREATE TYPE "public"."kit_type" AS ENUM('home', 'away', 'third', 'gk', 'special');--> statement-breakpoint
CREATE TYPE "public"."label_kind" AS ENUM('label', 'alias');--> statement-breakpoint
CREATE TYPE "public"."label_locale" AS ENUM('da', 'en', 'sv', 'no', 'mul');--> statement-breakpoint
CREATE TYPE "public"."label_source" AS ENUM('seed', 'admin');--> statement-breakpoint
CREATE TYPE "public"."national_team_gender" AS ENUM('men', 'women');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "catalog_label" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" "catalog_entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"locale" "label_locale" NOT NULL,
	"kind" "label_kind" NOT NULL,
	"text" text NOT NULL,
	"source" "label_source" DEFAULT 'seed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "club" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_id" uuid NOT NULL,
	"kind" "club_kind" DEFAULT 'club' NOT NULL,
	"successor_club_id" uuid,
	"valid_from" date,
	"valid_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "country" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"iso3166" text NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_id" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" "external_id_entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"system" text NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid,
	"national_team_id" uuid,
	"season_id" uuid NOT NULL,
	"type" "kit_type" NOT NULL,
	"manufacturer_id" uuid,
	"sponsor_name" text,
	"valid_from" date,
	"valid_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kit_photo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kit_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"rights" "kit_photo_rights" DEFAULT 'unresolved' NOT NULL,
	"visibility" "kit_photo_visibility" DEFAULT 'admin_only' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "league" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_id" uuid NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manufacturer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "national_team" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_id" uuid NOT NULL,
	"gender" "national_team_gender" NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_club_season" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"club_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"squad_number" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "season" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid,
	"label" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"calendar_kind" "calendar_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_season" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "club" ADD CONSTRAINT "club_country_id_country_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."country"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club" ADD CONSTRAINT "club_successor_club_id_club_id_fk" FOREIGN KEY ("successor_club_id") REFERENCES "public"."club"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kit" ADD CONSTRAINT "kit_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kit" ADD CONSTRAINT "kit_national_team_id_national_team_id_fk" FOREIGN KEY ("national_team_id") REFERENCES "public"."national_team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kit" ADD CONSTRAINT "kit_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kit" ADD CONSTRAINT "kit_manufacturer_id_manufacturer_id_fk" FOREIGN KEY ("manufacturer_id") REFERENCES "public"."manufacturer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kit_photo" ADD CONSTRAINT "kit_photo_kit_id_kit_id_fk" FOREIGN KEY ("kit_id") REFERENCES "public"."kit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league" ADD CONSTRAINT "league_country_id_country_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."country"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "national_team" ADD CONSTRAINT "national_team_country_id_country_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."country"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_club_season" ADD CONSTRAINT "player_club_season_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_club_season" ADD CONSTRAINT "player_club_season_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_club_season" ADD CONSTRAINT "player_club_season_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season" ADD CONSTRAINT "season_league_id_league_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."league"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_season" ADD CONSTRAINT "team_season_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_season" ADD CONSTRAINT "team_season_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_label_entity_locale_label_unique" ON "catalog_label" USING btree ("entity_type","entity_id","locale") WHERE kind = 'label';--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_label_entity_locale_alias_text_unique" ON "catalog_label" USING btree ("entity_type","entity_id","locale","text") WHERE kind = 'alias';--> statement-breakpoint
CREATE UNIQUE INDEX "external_id_system_value_unique" ON "external_id" USING btree ("system","value");--> statement-breakpoint
CREATE UNIQUE INDEX "player_club_season_unique" ON "player_club_season" USING btree ("player_id","club_id","season_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_season_club_season_unique" ON "team_season" USING btree ("club_id","season_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_unique" ON "user" USING btree ("email");