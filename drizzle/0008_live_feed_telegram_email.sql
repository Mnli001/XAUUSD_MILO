CREATE TABLE "live_ticks" (
	"symbol" text PRIMARY KEY NOT NULL,
	"bid" double precision NOT NULL,
	"ask" double precision NOT NULL,
	"time" timestamp with time zone NOT NULL,
	"source" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_pending_chat_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_pending_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_pending_expires_at" timestamp with time zone;