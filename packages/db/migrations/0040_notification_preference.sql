-- 0040_notification_preference
-- Notification switches per Collector: e-mail (bids and messages, wish matches, news) and push
-- (bids, messages, wish matches). A Collector with no row has the defaults, which live in
-- @kit/api-contract, so there is no backfill and no column default here.
-- Safe to run again: every statement is guarded.
-- Down:
--   DROP TABLE IF EXISTS "notification_preference";

CREATE TABLE IF NOT EXISTS "notification_preference" (
  "user_id" uuid PRIMARY KEY NOT NULL,
  "email_bids_and_messages" boolean NOT NULL,
  "email_wish_matches" boolean NOT NULL,
  "email_news" boolean NOT NULL,
  "push_bids" boolean NOT NULL,
  "push_messages" boolean NOT NULL,
  "push_wish_matches" boolean NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "notification_preference"
    ADD CONSTRAINT "notification_preference_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
