CREATE TABLE "condition_alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"symbol" text DEFAULT 'XAUUSD' NOT NULL,
	"kind" text NOT NULL,
	"timeframe" text NOT NULL,
	"value" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_bar_at" timestamp with time zone,
	"last_fired_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "condition_alerts" ADD CONSTRAINT "condition_alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "condition_alerts_user" ON "condition_alerts" USING btree ("user_id");