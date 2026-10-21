CREATE TYPE "public"."series_frequency" AS ENUM('weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."series_monthly_mode" AS ENUM('day_of_month', 'weekday_rank', 'last_weekday');--> statement-breakpoint
ALTER TYPE "public"."email_type" ADD VALUE 'series_confirmation';--> statement-breakpoint
CREATE TABLE "appointment_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"frequency" "series_frequency" NOT NULL,
	"interval_weeks" smallint,
	"monthly_mode" "series_monthly_mode",
	"anchor_on" date NOT NULL,
	"start_time" time NOT NULL,
	"staff_id" uuid,
	"last_planned_on" date NOT NULL,
	"created_by_staff_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointment_series_rule" CHECK (("appointment_series"."frequency" = 'weekly' and "appointment_series"."interval_weeks" between 1 and 4 and "appointment_series"."monthly_mode" is null)
       or ("appointment_series"."frequency" = 'monthly' and "appointment_series"."interval_weeks" is null and "appointment_series"."monthly_mode" is not null)),
	CONSTRAINT "appointment_series_planned" CHECK ("appointment_series"."last_planned_on" >= "appointment_series"."anchor_on")
);
--> statement-breakpoint
ALTER TABLE "appointment" ADD COLUMN "series_id" uuid;--> statement-breakpoint
ALTER TABLE "appointment_series" ADD CONSTRAINT "appointment_series_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_series" ADD CONSTRAINT "appointment_series_created_by_staff_id_staff_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_series_id_appointment_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."appointment_series"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointment_series_idx" ON "appointment" USING btree ("series_id","starts_at");--> statement-breakpoint
-- Comme toutes les tables : aucun accès depuis le navigateur (principe 2, migration 0002).
ALTER TABLE "appointment_series" ENABLE ROW LEVEL SECURITY;
