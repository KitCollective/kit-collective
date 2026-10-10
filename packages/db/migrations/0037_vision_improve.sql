-- 0037_vision_improve
-- Staff-gated Vision improve proposals keyed by fingerprint.
-- No FK to user_jersey or vision_log: take-down deletes vision_log today and must
-- not cascade-delete aggregated alias/seed/prompt rows.
-- Reverse (down):
--   DROP INDEX IF EXISTS "vision_improve_status_idx";
--   DROP INDEX IF EXISTS "vision_improve_fingerprint_unique";
--   DROP TABLE IF EXISTS "vision_improve";
--   DROP TYPE IF EXISTS "public"."vision_improve_field";
--   DROP TYPE IF EXISTS "public"."vision_improve_entity_type";
--   DROP TYPE IF EXISTS "public"."vision_improve_status";
--   DROP TYPE IF EXISTS "public"."vision_improve_kind";

CREATE TYPE "public"."vision_improve_kind" AS ENUM('alias', 'seed', 'prompt');--> statement-breakpoint
CREATE TYPE "public"."vision_improve_status" AS ENUM('proposed', 'applied', 'dismissed', 'noted');--> statement-breakpoint
CREATE TYPE "public"."vision_improve_entity_type" AS ENUM('club', 'national_team', 'season', 'kit', 'player', 'patch');--> statement-breakpoint
CREATE TYPE "public"."vision_improve_field" AS ENUM('side', 'season', 'type', 'catalogKitId', 'player', 'patch');--> statement-breakpoint
CREATE TABLE "vision_improve" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "vision_improve_kind" NOT NULL,
	"status" "vision_improve_status" DEFAULT 'proposed' NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"fingerprint" text NOT NULL,
	"text" text,
	"entity_type" "vision_improve_entity_type",
	"entity_id" uuid,
	"field" "vision_improve_field",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "vision_improve_fingerprint_unique" ON "vision_improve" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "vision_improve_status_idx" ON "vision_improve" USING btree ("status");
