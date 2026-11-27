CREATE TABLE "risk_rules" (
	"user_id" text NOT NULL,
	"login" text NOT NULL,
	"account_size" double precision NOT NULL,
	"daily_loss_pct" double precision NOT NULL,
	"max_loss_pct" double precision NOT NULL,
	"profit_target_pct" double precision,
	"close_on_breach" boolean DEFAULT true NOT NULL,
	"day_key" text DEFAULT '' NOT NULL,
	"day_start_equity" double precision DEFAULT 0 NOT NULL,
	"warned" text DEFAULT '' NOT NULL,
	"breach" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "risk_rules_user_id_login_pk" PRIMARY KEY("user_id","login")
);
--> statement-breakpoint
ALTER TABLE "risk_rules" ADD CONSTRAINT "risk_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;