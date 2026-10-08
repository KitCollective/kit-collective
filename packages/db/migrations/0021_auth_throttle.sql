ALTER TYPE "auth_event_kind" ADD VALUE IF NOT EXISTS 'lockout';
--> statement-breakpoint
CREATE TABLE "auth_throttle_hit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bucket" text NOT NULL,
	"bucket_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "auth_throttle_hit_bucket_key_created_idx" ON "auth_throttle_hit" USING btree ("bucket","bucket_key","created_at");
