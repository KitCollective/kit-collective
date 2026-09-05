-- 0024_kit_colour_grain
-- Kit grain: primary and secondary colour hex from Football Kit Archive.
--
-- Reverse (down):
--   ALTER TABLE "kit" DROP COLUMN IF EXISTS "secondary_color_hex";
--   ALTER TABLE "kit" DROP COLUMN IF EXISTS "primary_color_hex";

ALTER TABLE "kit" ADD COLUMN "primary_color_hex" text;
--> statement-breakpoint
ALTER TABLE "kit" ADD COLUMN "secondary_color_hex" text;
