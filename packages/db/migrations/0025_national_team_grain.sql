ALTER TABLE "national_team" ADD COLUMN "founded_on" date;--> statement-breakpoint
ALTER TABLE "national_team" ADD COLUMN "confederation" text;--> statement-breakpoint
CREATE TABLE "national_team_season" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"national_team_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "national_team_season" ADD CONSTRAINT "national_team_season_national_team_id_national_team_id_fk" FOREIGN KEY ("national_team_id") REFERENCES "public"."national_team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "national_team_season" ADD CONSTRAINT "national_team_season_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "national_team_season_nt_season_unique" ON "national_team_season" USING btree ("national_team_id","season_id");--> statement-breakpoint
CREATE TABLE "player_national_team_season" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"national_team_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"squad_number" integer,
	"position" text,
	"call_up_club_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "player_national_team_season" ADD CONSTRAINT "player_national_team_season_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_national_team_season" ADD CONSTRAINT "player_national_team_season_national_team_id_national_team_id_fk" FOREIGN KEY ("national_team_id") REFERENCES "public"."national_team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_national_team_season" ADD CONSTRAINT "player_national_team_season_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_national_team_season" ADD CONSTRAINT "player_national_team_season_call_up_club_id_club_id_fk" FOREIGN KEY ("call_up_club_id") REFERENCES "public"."club"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "player_national_team_season_unique" ON "player_national_team_season" USING btree ("player_id","national_team_id","season_id");
