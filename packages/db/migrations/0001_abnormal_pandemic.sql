CREATE TYPE "public"."authenticity" AS ENUM('unknown', 'genuine', 'replica');--> statement-breakpoint
CREATE TYPE "public"."jersey_condition" AS ENUM('new', 'used', 'worn');--> statement-breakpoint
CREATE TYPE "public"."jersey_size" AS ENUM('xs', 's', 'm', 'l', 'xl', 'xxl');--> statement-breakpoint
CREATE TYPE "public"."ocr_status" AS ENUM('none');--> statement-breakpoint
CREATE TYPE "public"."photo_role" AS ENUM('front', 'back', 'label');--> statement-breakpoint
CREATE TYPE "public"."photo_source" AS ENUM('gallery', 'camera');--> statement-breakpoint
CREATE TABLE "jersey_draft" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"user_jersey_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_jersey" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"club_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"catalog_kit_id" uuid,
	"type" "kit_type" NOT NULL,
	"size" "jersey_size" NOT NULL,
	"condition" "jersey_condition" NOT NULL,
	"authenticity" "authenticity" DEFAULT 'unknown' NOT NULL,
	"notes" text,
	"draft_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_jersey_photo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_jersey_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"role" "photo_role" NOT NULL,
	"source" "photo_source" NOT NULL,
	"ocr_status" "ocr_status" DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jersey_draft" ADD CONSTRAINT "jersey_draft_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jersey_draft" ADD CONSTRAINT "jersey_draft_user_jersey_id_user_jersey_id_fk" FOREIGN KEY ("user_jersey_id") REFERENCES "public"."user_jersey"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_jersey" ADD CONSTRAINT "user_jersey_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_jersey" ADD CONSTRAINT "user_jersey_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_jersey" ADD CONSTRAINT "user_jersey_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_jersey" ADD CONSTRAINT "user_jersey_catalog_kit_id_kit_id_fk" FOREIGN KEY ("catalog_kit_id") REFERENCES "public"."kit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_jersey_photo" ADD CONSTRAINT "user_jersey_photo_user_jersey_id_user_jersey_id_fk" FOREIGN KEY ("user_jersey_id") REFERENCES "public"."user_jersey"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "jersey_draft_user_id_unique" ON "jersey_draft" USING btree ("user_id","id");