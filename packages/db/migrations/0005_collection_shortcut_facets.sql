ALTER TABLE "collection_shortcut" ADD COLUMN "country_id" uuid;--> statement-breakpoint
ALTER TABLE "collection_shortcut" ADD COLUMN "league_id" uuid;--> statement-breakpoint
ALTER TABLE "collection_shortcut" ADD COLUMN "player_id" uuid;--> statement-breakpoint
ALTER TABLE "collection_shortcut" ADD CONSTRAINT "collection_shortcut_country_id_country_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."country"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_shortcut" ADD CONSTRAINT "collection_shortcut_league_id_league_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."league"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_shortcut" ADD CONSTRAINT "collection_shortcut_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;
