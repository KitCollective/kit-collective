CREATE TYPE "public"."entitlement_source" AS ENUM('iap_apple', 'iap_google', 'trial', 'comp');--> statement-breakpoint
CREATE TABLE "entitlement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" "entitlement_source",
	"expires" timestamp with time zone,
	"trial_used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"month_product_id" text NOT NULL,
	"year_product_id" text NOT NULL,
	"trial_enabled" boolean DEFAULT false NOT NULL,
	"trial_days" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entitlement" ADD CONSTRAINT "entitlement_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "entitlement_user_id_unique" ON "entitlement" USING btree ("user_id");--> statement-breakpoint
INSERT INTO "offer" ("month_product_id", "year_product_id", "trial_enabled", "trial_days")
VALUES ('com.kitcollective.premium.month', 'com.kitcollective.premium.year', true, 3);
