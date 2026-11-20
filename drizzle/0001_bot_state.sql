CREATE TABLE "bot_state" (
	"id" text PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"start_balance" double precision DEFAULT 10000 NOT NULL
);
