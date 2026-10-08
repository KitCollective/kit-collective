CREATE TYPE "public"."identity_linked_provider" AS ENUM('google', 'facebook');--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "full_name" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "birthday" date;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "email_verified" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE TABLE "identity_provider" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "identity_linked_provider" NOT NULL,
	"provider_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "identity_provider" ADD CONSTRAINT "identity_provider_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "identity_provider_user_provider_unique" ON "identity_provider" USING btree ("user_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_provider_provider_user_unique" ON "identity_provider" USING btree ("provider","provider_user_id");
