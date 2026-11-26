ALTER TABLE "signals" ADD COLUMN "result_sent_at" timestamp with time zone;--> statement-breakpoint
-- Signals from before this change are not announced again.
UPDATE "signals" SET "result_sent_at" = now() WHERE "created_at" < now() - interval '1 day';
