-- 0032_catalog_mark
-- Admin-only catalog identity marks: club crest, league badge, honour trophy,
-- national-team mark. Bytes live in the lane object store (same rights model as
-- player_photo). Transfermarkt URLs are never stored.
--
-- Reverse (down):
--   DROP TABLE IF EXISTS "catalog_mark";
--   DROP TYPE IF EXISTS "public"."catalog_mark_entity_type";

CREATE TYPE "public"."catalog_mark_entity_type" AS ENUM('club', 'league', 'honour', 'national_team');
--> statement-breakpoint
CREATE TABLE "catalog_mark" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" "catalog_mark_entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"rights" "kit_photo_rights" DEFAULT 'unresolved' NOT NULL,
	"visibility" "kit_photo_visibility" DEFAULT 'admin_only' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_mark_entity_unique" ON "catalog_mark" USING btree ("entity_type","entity_id");
