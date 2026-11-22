CREATE TABLE "signals" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"setup_id" text NOT NULL,
	"name" text NOT NULL,
	"side" text NOT NULL,
	"entry" double precision NOT NULL,
	"stop" double precision NOT NULL,
	"target" double precision NOT NULL,
	"sent_to" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "signals_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_chat_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_link_code" text;--> statement-breakpoint
CREATE INDEX "signals_created" ON "signals" USING btree ("created_at");