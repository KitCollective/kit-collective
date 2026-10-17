-- 0039_conversation_system_message
-- A system line in a Conversation (kind `system`) with a fixed reason: `bid_accepted` in the
-- accepted Bud's Conversation, `jersey_gone` where a Bud was declined because another was accepted.
-- Postgres refuses a new enum value in the transaction that adds it, and the migrator runs every
-- pending migration in one transaction: the check compares `kind::text`, never the new literal.
-- Safe to run again: every statement is guarded.
-- Down (only while no `system` row exists; an enum value cannot be dropped in place):
--   ALTER TABLE "conversation_message" DROP CONSTRAINT IF EXISTS "conversation_message_system_reason";
--   ALTER TABLE "conversation_message" DROP COLUMN IF EXISTS "system_reason";
--   DROP TYPE IF EXISTS "system_reason";
--   Removing `system` from "message_kind" means recreating the type without it.

ALTER TYPE "message_kind" ADD VALUE IF NOT EXISTS 'system';--> statement-breakpoint
DO $$
BEGIN
  CREATE TYPE "public"."system_reason" AS ENUM('bid_accepted', 'jersey_gone');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
ALTER TABLE "conversation_message" ADD COLUMN IF NOT EXISTS "system_reason" "system_reason";--> statement-breakpoint
ALTER TABLE "conversation_message" DROP CONSTRAINT IF EXISTS "conversation_message_system_reason";--> statement-breakpoint
ALTER TABLE "conversation_message" ADD CONSTRAINT "conversation_message_system_reason" CHECK (
  ("kind"::text = 'system') = ("system_reason" IS NOT NULL)
);
