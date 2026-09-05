ALTER TABLE "user_jersey_photo" ADD COLUMN IF NOT EXISTS "label" text;--> statement-breakpoint
CREATE TYPE "photo_role_new" AS ENUM('front', 'back', 'left', 'right', 'other');--> statement-breakpoint
ALTER TABLE "user_jersey_photo" ADD COLUMN "role_new" "photo_role_new";--> statement-breakpoint
UPDATE "user_jersey_photo"
SET
  "role_new" = CASE
    WHEN "role"::text = 'front' THEN 'front'::"photo_role_new"
    WHEN "role"::text = 'back' THEN 'back'::"photo_role_new"
    WHEN "role"::text = 'label' THEN 'other'::"photo_role_new"
    ELSE 'other'::"photo_role_new"
  END,
  "label" = CASE
    WHEN "role"::text = 'label' THEN COALESCE("label", 'Mærke')
    ELSE "label"
  END;--> statement-breakpoint
ALTER TABLE "user_jersey_photo" DROP COLUMN "role";--> statement-breakpoint
ALTER TABLE "user_jersey_photo" RENAME COLUMN "role_new" TO "role";--> statement-breakpoint
ALTER TABLE "user_jersey_photo" ALTER COLUMN "role" SET NOT NULL;--> statement-breakpoint
DROP TYPE "photo_role";--> statement-breakpoint
ALTER TYPE "photo_role_new" RENAME TO "photo_role";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_jersey_photo_universal_role_unique" ON "user_jersey_photo" ("user_jersey_id", "role") WHERE "role" IN ('front', 'back', 'left', 'right');
