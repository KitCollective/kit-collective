CREATE TABLE "user_jersey_favorite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collector_id" uuid NOT NULL,
	"user_jersey_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_jersey_favorite" ADD CONSTRAINT "user_jersey_favorite_collector_id_user_id_fk" FOREIGN KEY ("collector_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_jersey_favorite" ADD CONSTRAINT "user_jersey_favorite_user_jersey_id_user_jersey_id_fk" FOREIGN KEY ("user_jersey_id") REFERENCES "public"."user_jersey"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_jersey_favorite_collector_jersey_unique" ON "user_jersey_favorite" USING btree ("collector_id","user_jersey_id");
