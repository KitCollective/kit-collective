ALTER TABLE "user" ADD COLUMN "handle" text;--> statement-breakpoint
UPDATE "user" SET "handle" = lower(regexp_replace(split_part("email", '@', 1), '[^a-zA-Z0-9_]', '', 'g'))
WHERE "handle" IS NULL;--> statement-breakpoint
UPDATE "user" SET "handle" = 'user' WHERE "handle" IS NULL OR "handle" = '';--> statement-breakpoint
UPDATE "user" u SET "handle" = u."handle" || substr(replace(u."id"::text, '-', ''), 1, 4)
WHERE EXISTS (
  SELECT 1 FROM "user" u2
  WHERE u2."handle" = u."handle" AND u2."id" <> u."id"
);--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "handle" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "user_handle_unique" ON "user" ("handle");
