ALTER TABLE "user" ADD COLUMN "country_id" uuid;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_country_id_country_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."country"("id") ON DELETE no action ON UPDATE no action;
