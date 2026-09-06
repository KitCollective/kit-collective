CREATE TYPE "public"."vision_job_kind" AS ENUM('identity', 'grouping');--> statement-breakpoint
ALTER TABLE "vision_log" ADD COLUMN "kind" "vision_job_kind" NOT NULL DEFAULT 'identity';--> statement-breakpoint
ALTER TABLE "vision_log" ADD COLUMN "grouping_result" text;
