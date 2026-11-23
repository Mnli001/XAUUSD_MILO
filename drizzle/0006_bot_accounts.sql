-- One bot per MT5 account of a user. The token moves to its own table, shared by all of a user's accounts.
CREATE TABLE "bot_tokens" (
	"user_id" text PRIMARY KEY NOT NULL,
	"token_hash" text
);--> statement-breakpoint
ALTER TABLE "bot_tokens" ADD CONSTRAINT "bot_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "bot_tokens" ("user_id", "token_hash") SELECT "user_id", "token_hash" FROM "bot_live";--> statement-breakpoint
CREATE UNIQUE INDEX "bot_tokens_token_hash" ON "bot_tokens" USING btree ("token_hash");--> statement-breakpoint
DROP INDEX "bot_live_token_hash";--> statement-breakpoint
ALTER TABLE "bot_live" DROP COLUMN "token_hash";--> statement-breakpoint
-- The existing bot keeps login "" and is adopted by the first account that connects, settings and history included.
ALTER TABLE "bot_live" ADD COLUMN "login" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "bot_live" ADD COLUMN "server" text;--> statement-breakpoint
ALTER TABLE "bot_live" DROP CONSTRAINT "bot_live_pkey";--> statement-breakpoint
ALTER TABLE "bot_live" ADD CONSTRAINT "bot_live_user_id_login_pk" PRIMARY KEY("user_id","login");--> statement-breakpoint
ALTER TABLE "bot_deals" ADD COLUMN "login" text DEFAULT '' NOT NULL;--> statement-breakpoint
DROP INDEX "bot_deals_user_close";--> statement-breakpoint
ALTER TABLE "bot_deals" DROP CONSTRAINT "bot_deals_user_id_ticket_pk";--> statement-breakpoint
ALTER TABLE "bot_deals" ADD CONSTRAINT "bot_deals_user_id_login_ticket_pk" PRIMARY KEY("user_id","login","ticket");--> statement-breakpoint
CREATE INDEX "bot_deals_user_close" ON "bot_deals" USING btree ("user_id","login","close_time");
