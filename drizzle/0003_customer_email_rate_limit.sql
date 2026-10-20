CREATE TABLE "rate_limit" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"window_ends_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "customer_email_unique" ON "customer" USING btree (lower("email")) WHERE "customer"."email" is not null;--> statement-breakpoint
-- Principe 5 : sécurité par ligne sans politique, comme sur toutes les tables.
ALTER TABLE "rate_limit" ENABLE ROW LEVEL SECURITY;
