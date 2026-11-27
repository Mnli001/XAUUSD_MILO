ALTER TABLE "journal_trades" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'mt5' NOT NULL;--> statement-breakpoint
ALTER TABLE "journal_trades" ADD COLUMN IF NOT EXISTS "stop_loss" double precision;--> statement-breakpoint
ALTER TABLE "journal_trades" ADD COLUMN IF NOT EXISTS "note" text;