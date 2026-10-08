ALTER TABLE "collection_shortcut" DROP CONSTRAINT "collection_shortcut_country_id_country_id_fk";--> statement-breakpoint
ALTER TABLE "collection_shortcut" DROP CONSTRAINT "collection_shortcut_league_id_league_id_fk";--> statement-breakpoint
ALTER TABLE "collection_shortcut" DROP CONSTRAINT "collection_shortcut_player_id_player_id_fk";--> statement-breakpoint
ALTER TABLE "collection_shortcut" DROP COLUMN "country_id";--> statement-breakpoint
ALTER TABLE "collection_shortcut" DROP COLUMN "league_id";--> statement-breakpoint
ALTER TABLE "collection_shortcut" DROP COLUMN "player_id";
