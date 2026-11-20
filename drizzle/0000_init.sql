CREATE TYPE "public"."direction" AS ENUM('BUY', 'SELL');--> statement-breakpoint
CREATE TYPE "public"."impact" AS ENUM('HIGH', 'MEDIUM', 'LOW');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('USER', 'ADMIN');--> statement-breakpoint
CREATE TABLE "bias_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"total" double precision NOT NULL,
	"buyer_pct" integer NOT NULL,
	"label" text NOT NULL,
	"per_timeframe" jsonb NOT NULL,
	"levels" jsonb,
	"hourly" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candles" (
	"symbol" text NOT NULL,
	"timeframe" text NOT NULL,
	"time" timestamp with time zone NOT NULL,
	"open" double precision NOT NULL,
	"high" double precision NOT NULL,
	"low" double precision NOT NULL,
	"close" double precision NOT NULL,
	CONSTRAINT "candles_symbol_timeframe_time_pk" PRIMARY KEY("symbol","timeframe","time")
);
--> statement-breakpoint
CREATE TABLE "economic_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"country" text NOT NULL,
	"impact" "impact" NOT NULL,
	"time" timestamp with time zone NOT NULL,
	"forecast" text,
	"previous" text,
	"actual" text,
	"source" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_reactions" (
	"type" text PRIMARY KEY NOT NULL,
	"n" integer NOT NULL,
	"stats" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"symbol" text DEFAULT 'XAUUSD' NOT NULL,
	"direction" "direction" NOT NULL,
	"lots" double precision NOT NULL,
	"entry_price" double precision NOT NULL,
	"exit_price" double precision,
	"stop_loss" double precision,
	"take_profit" double precision,
	"opened_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"note" text,
	"image" "bytea",
	"image_mime" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" DEFAULT 'USER' NOT NULL,
	"access_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bias_symbol_time" ON "bias_snapshots" USING btree ("symbol","computed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "event_type_time" ON "economic_events" USING btree ("type","time");--> statement-breakpoint
CREATE INDEX "event_time" ON "economic_events" USING btree ("time");--> statement-breakpoint
CREATE INDEX "trade_user_opened" ON "trades" USING btree ("user_id","opened_at");