-- 0033_kit_fka_facts
-- Football Kit Archive kit-page facts: design, colour names, competition,
-- release date, and the long description. Extra KitPhoto rows stay on kit_photo.
--
-- Reverse (down):
--   ALTER TABLE "kit" DROP COLUMN IF EXISTS "description";
--   ALTER TABLE "kit" DROP COLUMN IF EXISTS "released_on";
--   ALTER TABLE "kit" DROP COLUMN IF EXISTS "competition";
--   ALTER TABLE "kit" DROP COLUMN IF EXISTS "color_names";
--   ALTER TABLE "kit" DROP COLUMN IF EXISTS "design";

ALTER TABLE "kit" ADD COLUMN "design" text;
--> statement-breakpoint
ALTER TABLE "kit" ADD COLUMN "color_names" text;
--> statement-breakpoint
ALTER TABLE "kit" ADD COLUMN "competition" text;
--> statement-breakpoint
ALTER TABLE "kit" ADD COLUMN "released_on" date;
--> statement-breakpoint
ALTER TABLE "kit" ADD COLUMN "description" text;
