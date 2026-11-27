ALTER TABLE "journal_trades" ADD COLUMN "source" text DEFAULT 'mt5' NOT NULL;--> statement-breakpoint
ALTER TABLE "journal_trades" ADD COLUMN "stop_loss" double precision;--> statement-breakpoint
ALTER TABLE "journal_trades" ADD COLUMN "note" text;