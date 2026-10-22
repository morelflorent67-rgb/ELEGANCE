CREATE TYPE "public"."payment_status" AS ENUM('pending', 'successful', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"provider_reference" text,
	"failure_reason" text,
	"started_by_staff_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "payment_amount" CHECK ("payment"."amount_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "salon_settings" ADD COLUMN "payment_merchant_code" text;--> statement-breakpoint
ALTER TABLE "salon_settings" ADD COLUMN "payment_reader_id" text;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_appointment_id_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_started_by_staff_id_staff_id_fk" FOREIGN KEY ("started_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_one_pending" ON "payment" USING btree ("status") WHERE "payment"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "payment_provider_reference" ON "payment" USING btree ("provider_reference");--> statement-breakpoint
CREATE INDEX "payment_appointment_idx" ON "payment" USING btree ("appointment_id","status");
--> statement-breakpoint
-- Comme toutes les tables : aucun accès depuis le navigateur (principe 2, migration 0002).
ALTER TABLE "payment" ENABLE ROW LEVEL SECURITY;
