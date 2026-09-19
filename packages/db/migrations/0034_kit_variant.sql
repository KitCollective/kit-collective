-- 0034_kit_variant
-- Open FKA remainder on kit (european, supercoppa-italiana, home-v2).
-- Null on the league default of a type. Identity is (side, season, type, variant).
--
-- Reverse (down):
--   ALTER TABLE "kit" DROP COLUMN IF EXISTS "variant";

ALTER TABLE "kit" ADD COLUMN "variant" text;
