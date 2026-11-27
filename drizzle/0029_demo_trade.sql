CREATE TABLE "demo_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"leverage" integer NOT NULL,
	"balance" double precision NOT NULL,
	"start_balance" double precision NOT NULL,
	"beginner" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demo_cash" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"kind" text NOT NULL,
	"amount" double precision NOT NULL,
	"balance_after" double precision NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demo_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"user_id" text NOT NULL,
	"side" text NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"lots" double precision NOT NULL,
	"price" double precision,
	"open_price" double precision,
	"opened_at" timestamp with time zone,
	"sl" double precision,
	"tp" double precision,
	"close_price" double precision,
	"closed_at" timestamp with time zone,
	"close_reason" text,
	"profit" double precision,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "demo_accounts" ADD CONSTRAINT "demo_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo_cash" ADD CONSTRAINT "demo_cash_account_id_demo_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."demo_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo_orders" ADD CONSTRAINT "demo_orders_account_id_demo_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."demo_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo_orders" ADD CONSTRAINT "demo_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "demo_accounts_user" ON "demo_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "demo_cash_account" ON "demo_cash" USING btree ("account_id","at");--> statement-breakpoint
CREATE INDEX "demo_orders_account" ON "demo_orders" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX "demo_orders_status" ON "demo_orders" USING btree ("status");