ALTER TABLE "user" ADD COLUMN "handle" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "about_me" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "avatar_object_key" text;--> statement-breakpoint
UPDATE "user" SET "handle" = 'user_' || substr(replace(id::text, '-', ''), 1, 12) WHERE "handle" IS NULL;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "handle" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "user_handle_unique" ON "user" USING btree ("handle");
