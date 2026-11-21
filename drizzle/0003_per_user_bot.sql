-- One bot per user. The single "main" bot that existed before becomes the first admin's bot,
-- keeping its token, settings and history, so an already connected terminal keeps working.
ALTER TABLE "bot_live" RENAME COLUMN "id" TO "user_id";--> statement-breakpoint
UPDATE "bot_live" SET "user_id" = (SELECT "id" FROM "users" WHERE "role" = 'ADMIN' ORDER BY "created_at" LIMIT 1)
  WHERE "user_id" = 'main' AND EXISTS (SELECT 1 FROM "users" WHERE "role" = 'ADMIN');--> statement-breakpoint
DELETE FROM "bot_live" WHERE "user_id" NOT IN (SELECT "id" FROM "users");--> statement-breakpoint
ALTER TABLE "bot_live" ADD CONSTRAINT "bot_live_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bot_live_token_hash" ON "bot_live" USING btree ("token_hash");--> statement-breakpoint
ALTER TABLE "bot_deals" ADD COLUMN "user_id" text;--> statement-breakpoint
UPDATE "bot_deals" SET "user_id" = (SELECT "id" FROM "users" WHERE "role" = 'ADMIN' ORDER BY "created_at" LIMIT 1);--> statement-breakpoint
DELETE FROM "bot_deals" WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "bot_deals" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "bot_deals" DROP CONSTRAINT "bot_deals_pkey";--> statement-breakpoint
ALTER TABLE "bot_deals" ADD CONSTRAINT "bot_deals_user_id_ticket_pk" PRIMARY KEY("user_id","ticket");--> statement-breakpoint
ALTER TABLE "bot_deals" ADD CONSTRAINT "bot_deals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
DROP INDEX "bot_deals_close_time";--> statement-breakpoint
CREATE INDEX "bot_deals_user_close" ON "bot_deals" USING btree ("user_id","close_time");
