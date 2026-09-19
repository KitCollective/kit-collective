CREATE TYPE "public"."user_locale" AS ENUM('da', 'en', 'sv', 'no');--> statement-breakpoint
CREATE TYPE "public"."appearance_mode" AS ENUM('system', 'light', 'dark');--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "locale" "user_locale" DEFAULT 'da' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "appearance" "appearance_mode" DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "push_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "push_high_priority" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "push_other" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "email_news" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "email_high_priority" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "privacy_personalised" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "privacy_recently_seen" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "privacy_favorite_notifications" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "cookie_analysis" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "cookie_marketing" boolean DEFAULT false NOT NULL;
