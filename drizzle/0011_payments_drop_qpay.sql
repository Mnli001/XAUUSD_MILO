DROP INDEX "payments_qpay_invoice";--> statement-breakpoint
ALTER TABLE "payments" DROP COLUMN "qpay_invoice_id";--> statement-breakpoint
ALTER TABLE "payments" DROP COLUMN "qr_image";--> statement-breakpoint
ALTER TABLE "payments" DROP COLUMN "qr_text";--> statement-breakpoint
ALTER TABLE "payments" DROP COLUMN "short_url";--> statement-breakpoint
ALTER TABLE "payments" DROP COLUMN "urls";--> statement-breakpoint
ALTER TABLE "payments" DROP COLUMN "qpay_payment_id";