ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "telegram_linked_via" text;--> statement-breakpoint
-- Chats linked through the email request were marked with '~email-linked' (EMAIL_LINKED) in telegram_pending_username.
UPDATE "users" SET "telegram_linked_via" = 'EMAIL' WHERE "telegram_pending_username" = '~email-linked' AND "telegram_chat_id" IS NOT NULL AND "telegram_linked_via" IS NULL;--> statement-breakpoint
UPDATE "users" SET "telegram_pending_username" = NULL WHERE "telegram_pending_username" = '~email-linked';--> statement-breakpoint
-- Every other linked chat was linked with the site's one-time code (or before the marker existed, which counted as the code).
UPDATE "users" SET "telegram_linked_via" = 'CODE' WHERE "telegram_chat_id" IS NOT NULL AND "telegram_linked_via" IS NULL;
