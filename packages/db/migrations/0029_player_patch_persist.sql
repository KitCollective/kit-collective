ALTER TABLE "user_jersey" ADD COLUMN "player_id" uuid;--> statement-breakpoint
ALTER TABLE "user_jersey" ADD CONSTRAINT "user_jersey_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "patch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"league_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "patch" ADD CONSTRAINT "patch_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patch" ADD CONSTRAINT "patch_league_id_league_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."league"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "user_jersey_patch" (
	"user_jersey_id" uuid NOT NULL,
	"patch_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_jersey_patch_user_jersey_id_patch_id_pk" PRIMARY KEY("user_jersey_id","patch_id")
);--> statement-breakpoint
ALTER TABLE "user_jersey_patch" ADD CONSTRAINT "user_jersey_patch_user_jersey_id_user_jersey_id_fk" FOREIGN KEY ("user_jersey_id") REFERENCES "public"."user_jersey"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_jersey_patch" ADD CONSTRAINT "user_jersey_patch_patch_id_patch_id_fk" FOREIGN KEY ("patch_id") REFERENCES "public"."patch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vision_log" ADD COLUMN "suggested_player_id" uuid;--> statement-breakpoint
ALTER TABLE "vision_log" ADD COLUMN "suggested_patch_id" uuid;--> statement-breakpoint
ALTER TABLE "vision_log" ADD CONSTRAINT "vision_log_suggested_player_id_player_id_fk" FOREIGN KEY ("suggested_player_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vision_log" ADD CONSTRAINT "vision_log_suggested_patch_id_patch_id_fk" FOREIGN KEY ("suggested_patch_id") REFERENCES "public"."patch"("id") ON DELETE no action ON UPDATE no action;
