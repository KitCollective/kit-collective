ALTER TABLE "country" ADD COLUMN "iso3166_alpha3" text;--> statement-breakpoint
ALTER TABLE "country" ADD COLUMN "iso3166_numeric" text;--> statement-breakpoint
ALTER TABLE "country" ADD COLUMN "iso3166_reserved" text;--> statement-breakpoint
ALTER TABLE "country" ADD COLUMN "fifa" text;--> statement-breakpoint
ALTER TABLE "country" ADD COLUMN "ioc" text;--> statement-breakpoint
CREATE INDEX "country_iso3166_idx" ON "country" USING btree ("iso3166");--> statement-breakpoint
CREATE UNIQUE INDEX "country_iso3166_alpha3_unique" ON "country" USING btree ("iso3166_alpha3") WHERE "iso3166_alpha3" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "country_iso3166_numeric_unique" ON "country" USING btree ("iso3166_numeric") WHERE "iso3166_numeric" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "country_fifa_unique" ON "country" USING btree ("fifa") WHERE "fifa" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "country_ioc_unique" ON "country" USING btree ("ioc") WHERE "ioc" IS NOT NULL;
