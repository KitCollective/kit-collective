ALTER TABLE "conversation_message" ADD COLUMN "image_object_key" text;--> statement-breakpoint
ALTER TABLE "conversation_message" ADD COLUMN "reply_to_message_id" uuid;--> statement-breakpoint
ALTER TABLE "conversation_message" ADD CONSTRAINT "conversation_message_reply_to_message_id_conversation_message_id_fk" FOREIGN KEY ("reply_to_message_id") REFERENCES "public"."conversation_message"("id") ON DELETE no action ON UPDATE no action;
