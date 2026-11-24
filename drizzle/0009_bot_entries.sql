CREATE TABLE "bot_entries" (
	"user_id" text NOT NULL,
	"login" text DEFAULT '' NOT NULL,
	"ticket" text NOT NULL,
	"side" text NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"open_price" double precision NOT NULL,
	"lots" double precision NOT NULL,
	"c_buy" integer NOT NULL,
	"c_sell" integer NOT NULL,
	"c_total" integer NOT NULL,
	"atr_h1" double precision,
	"session" text NOT NULL,
	CONSTRAINT "bot_entries_user_id_login_ticket_pk" PRIMARY KEY("user_id","login","ticket")
);
--> statement-breakpoint
ALTER TABLE "bot_deals" ADD COLUMN "position" text;--> statement-breakpoint
ALTER TABLE "bot_entries" ADD CONSTRAINT "bot_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;