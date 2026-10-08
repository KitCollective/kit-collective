CREATE TYPE "public"."vision_job_status" AS ENUM('pending', 'ready', 'failed', 'noop');--> statement-breakpoint
CREATE TYPE "public"."vision_user_action" AS ENUM('accepted', 'edited', 'ignored');--> statement-breakpoint
CREATE TABLE "vision_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"draft_id" uuid,
	"user_jersey_id" uuid,
	"status" "vision_job_status" DEFAULT 'pending' NOT NULL,
	"suggested_club_id" uuid,
	"suggested_season_id" uuid,
	"suggested_catalog_kit_id" uuid,
	"suggested_type" "kit_type",
	"vision_raw" text,
	"confidences" text,
	"latency_ms" integer,
	"model" text,
	"user_action" "vision_user_action",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vision_log" ADD CONSTRAINT "vision_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vision_log" ADD CONSTRAINT "vision_log_user_jersey_id_user_jersey_id_fk" FOREIGN KEY ("user_jersey_id") REFERENCES "public"."user_jersey"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vision_log" ADD CONSTRAINT "vision_log_suggested_club_id_club_id_fk" FOREIGN KEY ("suggested_club_id") REFERENCES "public"."club"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vision_log" ADD CONSTRAINT "vision_log_suggested_season_id_season_id_fk" FOREIGN KEY ("suggested_season_id") REFERENCES "public"."season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vision_log" ADD CONSTRAINT "vision_log_suggested_catalog_kit_id_kit_id_fk" FOREIGN KEY ("suggested_catalog_kit_id") REFERENCES "public"."kit"("id") ON DELETE no action ON UPDATE no action;
