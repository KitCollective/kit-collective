CREATE TABLE "auth_security_detection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sentinel_id" text NOT NULL,
	"kind" text NOT NULL,
	"user_id" uuid,
	"summary" text NOT NULL,
	"detected_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "auth_security_detection_sentinel_id_unique" ON "auth_security_detection" USING btree ("sentinel_id");
--> statement-breakpoint
ALTER TABLE "auth_security_detection" ADD CONSTRAINT "auth_security_detection_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
