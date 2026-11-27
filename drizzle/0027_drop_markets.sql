-- The other-markets page is gone: its alerts and bars go with it (gold's alerts stay), then the column.
DELETE FROM "price_alerts" WHERE "symbol" <> 'XAUUSD';--> statement-breakpoint
DELETE FROM "candles" WHERE "symbol" IN ('XAGUSD', 'EURUSD', 'NAS100', 'BTCUSD');--> statement-breakpoint
ALTER TABLE "price_alerts" DROP COLUMN "symbol";
