CREATE TABLE "bot_deals" (
	"ticket" text PRIMARY KEY NOT NULL,
	"run_id" text,
	"side" text NOT NULL,
	"lots" double precision NOT NULL,
	"open_price" double precision NOT NULL,
	"close_price" double precision NOT NULL,
	"profit" double precision NOT NULL,
	"close_time" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_live" (
	"id" text PRIMARY KEY NOT NULL,
	"state" text DEFAULT 'STOPPED' NOT NULL,
	"run_id" text,
	"close_all" boolean DEFAULT false NOT NULL,
	"config" jsonb NOT NULL,
	"token_hash" text,
	"started_at" timestamp with time zone,
	"stopped_at" timestamp with time zone,
	"stop_reason" text,
	"last_seen_at" timestamp with time zone,
	"status" jsonb
);
--> statement-breakpoint
CREATE INDEX "bot_deals_close_time" ON "bot_deals" USING btree ("close_time");