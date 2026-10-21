CREATE TYPE "public"."customer_origin" AS ENUM('account', 'salon', 'import');--> statement-breakpoint
ALTER TABLE "appointment" ADD COLUMN "for_name" text;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "origin" "customer_origin" DEFAULT 'account' NOT NULL;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "legacy_visits" integer;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "legacy_last_visit_on" date;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "origin_notice_sent_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "customer_phone_idx" ON "customer" USING btree ("phone");--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_for_name_length" CHECK (char_length("appointment"."for_name") between 1 and 40);--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_legacy_visits" CHECK ("customer"."legacy_visits" is null or "customer"."legacy_visits" >= 0);