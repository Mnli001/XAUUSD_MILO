CREATE TYPE "public"."payment_status" AS ENUM('PENDING', 'PAID', 'EXPIRED');--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"plan" text NOT NULL,
	"amount" integer NOT NULL,
	"days" integer NOT NULL,
	"status" "payment_status" DEFAULT 'PENDING' NOT NULL,
	"sender_invoice_no" text NOT NULL,
	"qpay_invoice_id" text,
	"qr_image" text,
	"qr_text" text,
	"short_url" text,
	"urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"qpay_payment_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"checked_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"access_until" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_sender_no" ON "payments" USING btree ("sender_invoice_no");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_qpay_invoice" ON "payments" USING btree ("qpay_invoice_id");--> statement-breakpoint
CREATE INDEX "payments_user_created" ON "payments" USING btree ("user_id","created_at");