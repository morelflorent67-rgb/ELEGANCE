CREATE TYPE "public"."actor_type" AS ENUM('customer', 'staff', 'manager', 'system');--> statement-breakpoint
CREATE TYPE "public"."appointment_source" AS ENUM('online', 'salon');--> statement-breakpoint
CREATE TYPE "public"."appointment_status" AS ENUM('confirmed', 'honored', 'no_show', 'cancelled_by_customer', 'cancelled_by_salon');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."email_type" AS ENUM('confirmation', 'reminder', 'modification', 'cancellation', 'review_invitation');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('barber', 'apprentice');--> statement-breakpoint
CREATE TABLE "absence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "absence_order" CHECK ("absence"."ends_at" > "absence"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "appointment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "appointment_status" DEFAULT 'confirmed' NOT NULL,
	"source" "appointment_source" NOT NULL,
	"customer_note" text,
	"created_by_staff_id" uuid,
	"adjusted_amount_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointment_order" CHECK ("appointment"."ends_at" > "appointment"."starts_at"),
	CONSTRAINT "appointment_note_length" CHECK (char_length("appointment"."customer_note") <= 300)
);
--> statement-breakpoint
CREATE TABLE "appointment_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"name_snapshot" text NOT NULL,
	"price_cents" integer NOT NULL,
	"duration_min" integer NOT NULL,
	"position" smallint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "closure" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "closure_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"reason" text,
	CONSTRAINT "closure_order" CHECK ("closure"."ends_on" >= "closure"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "customer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_user_id" uuid,
	"first_name" text,
	"last_name" text,
	"phone" text,
	"email" text,
	"online_booking_blocked" boolean DEFAULT false NOT NULL,
	"anonymized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_auth_user_id_unique" UNIQUE("auth_user_id")
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "email_type" NOT NULL,
	"to_email" text NOT NULL,
	"appointment_id" uuid,
	"status" "email_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "email_outbox_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "opening_hours" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "opening_hours_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"weekday" smallint NOT NULL,
	"opens_at" time NOT NULL,
	"closes_at" time NOT NULL,
	CONSTRAINT "opening_hours_unique" UNIQUE("weekday","opens_at"),
	CONSTRAINT "opening_hours_weekday" CHECK ("opening_hours"."weekday" between 1 and 7),
	CONSTRAINT "opening_hours_order" CHECK ("opening_hours"."opens_at" < "opening_hours"."closes_at")
);
--> statement-breakpoint
CREATE TABLE "salon_settings" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"timezone" text DEFAULT 'Europe/Paris' NOT NULL,
	"min_notice_minutes" integer DEFAULT 60 NOT NULL,
	"max_horizon_days" integer DEFAULT 42 NOT NULL,
	"online_slot_step_minutes" integer DEFAULT 30 NOT NULL,
	"salon_slot_step_minutes" integer DEFAULT 15 NOT NULL,
	"change_cutoff_hours" integer DEFAULT 48 NOT NULL,
	"max_upcoming_per_customer" integer DEFAULT 2 NOT NULL,
	"no_show_block_threshold" integer DEFAULT 2 NOT NULL,
	"reminder_hours" integer DEFAULT 72 NOT NULL,
	"manager_pin_hash" text,
	CONSTRAINT "salon_settings_single_row" CHECK ("salon_settings"."id" = true),
	CONSTRAINT "salon_settings_positive" CHECK ("salon_settings"."min_notice_minutes" >= 0 and "salon_settings"."max_horizon_days" > 0),
	CONSTRAINT "salon_settings_steps" CHECK ("salon_settings"."online_slot_step_minutes" > 0 and "salon_settings"."salon_slot_step_minutes" > 0)
);
--> statement-breakpoint
CREATE TABLE "service" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"price_cents" integer NOT NULL,
	"duration_min" integer NOT NULL,
	"performed_by" "staff_role" NOT NULL,
	"bookable_online" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "service_duration" CHECK ("service"."duration_min" > 0 and "service"."duration_min" % 15 = 0),
	CONSTRAINT "service_price" CHECK ("service"."price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "service_staff" (
	"service_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	CONSTRAINT "service_staff_service_id_staff_id_pk" PRIMARY KEY("service_id","staff_id")
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" text NOT NULL,
	"role" "staff_role" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "absence" ADD CONSTRAINT "absence_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_created_by_staff_id_staff_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_item" ADD CONSTRAINT "appointment_item_appointment_id_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_item" ADD CONSTRAINT "appointment_item_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_appointment_id_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_staff" ADD CONSTRAINT "service_staff_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_staff" ADD CONSTRAINT "service_staff_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "absence_staff_idx" ON "absence" USING btree ("staff_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointment_customer_idx" ON "appointment" USING btree ("customer_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointment_staff_idx" ON "appointment" USING btree ("staff_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointment_item_appointment_idx" ON "appointment_item" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "email_outbox_due_idx" ON "email_outbox" USING btree ("status","next_attempt_at");