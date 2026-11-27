CREATE TABLE "journal_trades" (
	"user_id" text NOT NULL,
	"login" text NOT NULL,
	"ticket" text NOT NULL,
	"position" text,
	"symbol" text NOT NULL,
	"side" text NOT NULL,
	"lots" double precision NOT NULL,
	"open_price" double precision NOT NULL,
	"close_price" double precision NOT NULL,
	"open_time" timestamp with time zone NOT NULL,
	"close_time" timestamp with time zone NOT NULL,
	"profit" double precision NOT NULL,
	"magic" text DEFAULT '0' NOT NULL,
	CONSTRAINT "journal_trades_user_id_login_ticket_pk" PRIMARY KEY("user_id","login","ticket")
);
--> statement-breakpoint
ALTER TABLE "journal_trades" ADD CONSTRAINT "journal_trades_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "journal_user_close" ON "journal_trades" USING btree ("user_id","close_time");