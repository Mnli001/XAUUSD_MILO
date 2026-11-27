CREATE TABLE "macro_series" (
	"series" text NOT NULL,
	"date" text NOT NULL,
	"value" double precision NOT NULL,
	CONSTRAINT "macro_series_series_date_pk" PRIMARY KEY("series","date")
);
